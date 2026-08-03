/**
 * ZK-PRU Execution Planner
 *
 * Generates deterministic execution plans for payments with smart spend selection,
 * tranche-based spending, change routing, and dynamic fee calculation.
 *
 * Core principles:
 * 1. Single ZK-PRU preferred over multi-PRU spending
 * 2. Minimize Solana transaction count
 * 3. Minimize fragmentation cost
 * 4. Pre-compute all costs before user authorization
 * 5. Support deterministic replay for validation
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

import { createScopedPruIntent } from "./pru.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

export type ExecutionPlanStatus =
  | "PLANNED"
  | "AUTHORIZED"
  | "FUNDING_PARTIAL"
  | "FUNDING_COMPLETE"
  | "SETTLEMENT_READY"
  | "SETTLED"
  | "FAILED_RECOVERABLE"
  | "EXPIRED";

export type ChangeDestinationType =
  | "empty_reserve"
  | "underfilled"
  | "new_account";

export type SpendSelectionStrategy =
  | "single_pru_full_fund"
  | "minimal_pru_set"
  | "multi_pru_fragmented"
  | "wallet_topup_required";

/**
 * Represents a ZK-PRU balance available for selection
 */
export interface PruBalanceInfo {
  pruIndex: number;
  availableBalance: bigint;
  assetMint: string;
  lastUsedAt?: string;
}

/**
 * Change output destination
 */
export interface ChangeOutput {
  amount: bigint;
  destinationPruIndex: number;
  destinationType: ChangeDestinationType;
  justification: string;
}

/**
 * Selected PRU for spending with spend details
 */
export interface SelectedPruForSpend {
  pruIndex: number;
  balanceUsed: bigint;
  balanceRemaining: bigint;
  tranches: Array<{
    amount: bigint;
    destination: "payment" | "change";
  }>;
}

/**
 * Complete execution plan for a payment
 */
export type ExecutionPlanFundingMode =
  | "wallet_only_v2"
  | "zk_pru_only_v2"
  | "mixed_zk_pru_wallet_v2";

export interface ScopedSpendAuthorization {
  pruIndex: number;
  amountBaseUnits: string;
  nonce: number;
  authorizationHash: string;
  authorizationMessage: string;
  authorizationSignature: string;
  authorityPublicKey: string;
}

export interface ExecutionPlan {
  // Metadata
  planId: string;
  version: number;
  tinId: string;
  assetMint: string;
  assetSymbol: string;

  // Payment details
  requestedAmountBaseUnits: bigint;
  recipientIdentity: string;

  // Selection strategy details
  selectionStrategy: SpendSelectionStrategy;
  strategiesEvaluated: SpendSelectionStrategy[];

  // Selected PRUs and spending
  selectedPrus: SelectedPruForSpend[];
  totalSpendFromPrus: bigint;
  walletTopupAmountBaseUnits: bigint;

  // Outputs
  paymentOutput: {
    amount: bigint;
    destination: string;
  };
  changeOutputs: ChangeOutput[];
  totalChangeAmount: bigint;

  // Fees
  protocolFeeBaseUnits: bigint;
  estimatedNetworkFeeLamports: number;
  estimatedNetworkFeeUsd?: number;
  crankerRewardBaseUnits: bigint;
  crankerRewardUsd?: number;
  maxAuthorizedFeeBaseUnits: bigint;

  // Execution metrics
  expectedInstructionCount: number;
  expectedSolanaTransactionCount: number;
  expectedChangeAccountCount: number;

  // State management
  status: ExecutionPlanStatus;
  spendNonce: number;
  expiryTimestamp: number;
  routePlanHash: string;

  // Decision details
  decisions: {
    whySinglePruSelected?: string;
    whyMultiplePrusNeeded?: string;
    changeDestinationReasoning: string;
    walletTopupReasoning?: string;
  };

  // For validation and replay
  inputHash: string;
}

/**
 * Configuration for execution planning
 */
export interface ExecutionPlannerConfig {
  // Receiving
  baseReceiveTargetUsd: number;
  receiveTargetVariancePercent: number;

  // Spending
  standardSpendTrancheUsd: number;
  largeReceiptThresholdUsd: number;

  // Reserves
  minEmptyPrus: number;
  targetEmptyPrus: number;

  // Fees (base units, assumes 6-decimal USDC)
  protocolFeeBps: number;
  multiPruSurchargeBps: number;
  accountCreationCostLamports: number;
  transactionFixedCostLamports: number;
  crankerRewardBps: number;

  // Network
  solUsd?: number;
  tokenUsd?: number;

  // Time
  planTtlSeconds: number;
}

/**
 * Input for building an execution plan
 */
export interface ExecutionPlannerInput {
  tinId: string;
  assetMint: string;
  assetSymbol: string;
  assetDecimals: number;
  paymentAmountBaseUnits: bigint;
  recipientIdentity: string;
  availablePruBalances: PruBalanceInfo[];
  emptyPruIndices: number[];
  walletAvailableBaseUnits: bigint;
  currentSpendNonce: number;
  masterSeed?: Uint8Array | string | null;
  /** Ed25519 signature produced by the Layer 0 wallet over the plan message. */
  mainWalletSignature?: string | null;
  tsnVaultPubkey?: string | Uint8Array | null;
}

// ============================================================================
// Spend Selection Algorithm
// ============================================================================

/**
 * Evaluates whether a single PRU can fully fund the payment.
 * Returns a score reflecting practicality of change output and pattern avoidance.
 */
function evaluateSinglePruFullFund(
  pruBalance: bigint,
  paymentAmount: bigint,
  pruIndex: number,
  lastUsedAt?: string,
  lastSelectedPruIndex?: number,
): { canFund: boolean; score: number } {
  if (pruBalance < paymentAmount) {
    return { canFund: false, score: 0 };
  }

  const change = pruBalance - paymentAmount;

  // Score: prefer balances that produce practical change outputs
  // Exact match (zero change) is optimal for small payments
  let balanceEfficacy: number;
  if (change === 0n) {
    balanceEfficacy = 100; // Perfect exact match
  } else if (paymentAmount > 0n) {
    // Prefer change that is a small fraction of the source (clean tranche)
    const changeRatio = Number(change * 100n / pruBalance);
    if (changeRatio <= 10) {
      balanceEfficacy = 95; // Small change, good
    } else if (changeRatio <= 50) {
      balanceEfficacy = 85; // Moderate change
    } else {
      balanceEfficacy = 70; // Large change, less preferred
    }
  } else {
    balanceEfficacy = 50;
  }

  // Pattern avoidance: penalize if same PRU was recently selected
  const patternPenalty =
    lastSelectedPruIndex === pruIndex ? 15 : 0;

  // Recency: slightly prefer less-recently-used PRUs
  let recencyScore = 50;
  if (lastUsedAt) {
    const ageSeconds = (Date.now() - new Date(lastUsedAt).getTime()) / 1000;
    if (ageSeconds > 3600) recencyScore = 60;
    if (ageSeconds > 86400) recencyScore = 70;
  }

  const score = Math.max(0, (balanceEfficacy + recencyScore) / 2 - patternPenalty);

  return { canFund: true, score };
}

/**
 * Evaluates a multi-PRU selection strategy.
 * Uses greedy largest-balance-first, but penalises each additional PRU.
 */
function evaluateMultiPruStrategy(
  balances: PruBalanceInfo[],
  paymentAmount: bigint,
): Array<{
  prus: number[];
  score: number;
  totalBalance: bigint;
  change: bigint;
}> {
  const strategies: Array<{
    prus: number[];
    score: number;
    totalBalance: bigint;
    change: bigint;
  }> = [];

  // Greedy: take largest balances until satisfied
  const sorted = [...balances].sort((a, b) =>
    Number(b.availableBalance - a.availableBalance),
  );

  let accumulated = 0n;
  const selectedIndices: number[] = [];

  for (const pru of sorted) {
    if (accumulated >= paymentAmount) break;
    accumulated += pru.availableBalance;
    selectedIndices.push(pru.pruIndex);
  }

  if (accumulated >= paymentAmount) {
    const change = accumulated - paymentAmount;
    // Each additional PRU beyond the first adds transaction cost and pattern risk
    const pruPenalty = selectedIndices.length > 1
      ? (selectedIndices.length - 1) * 20
      : 0;
    // Penalise excess change (unwanted fragmentation)
    const changePenalty = change > paymentAmount / 2n ? 10 : 0;
    const score = Math.max(0, 60 - pruPenalty - changePenalty);
    strategies.push({
      prus: selectedIndices,
      score,
      totalBalance: accumulated,
      change,
    });
  }

  return strategies;
}

/**
 * Main spend selection algorithm.
 *
 * Priority order:
 * 1. Select a single ZK-PRU that can fund the complete payment.
 * 2. Minimise the number of selected ZK-PRUs.
 * 3. Minimise the number of Solana transactions.
 * 4. Avoid main-wallet top-up when a ZK-PRU route can fully cover the payment.
 * 5. Prefer a balance that produces a practical change output.
 * 6. Preserve protected-routing requirements.
 * 7. Avoid repeatedly selecting the same visible pattern.
 * 8. Use multiple ZK-PRUs only when no single ZK-PRU can fund the payment.
 */
export function selectOptimalSpendRoute(
  pruBalances: PruBalanceInfo[],
  walletBalance: bigint,
  paymentAmount: bigint,
  config: ExecutionPlannerConfig,
): {
  strategy: SpendSelectionStrategy;
  selectedPrus: number[];
  walletTopup: bigint;
  totalSpend: bigint;
  feasible: boolean;
  alternatives: SpendSelectionStrategy[];
  reasoning: string;
} {
  const alternatives: SpendSelectionStrategy[] = [];

  // Strategy 1: Find single PRU that can fully fund
  let bestSingle: { index: number; score: number } | null = null;
  for (const pruBalance of pruBalances) {
    const evaluation = evaluateSinglePruFullFund(
      pruBalance.availableBalance,
      paymentAmount,
      pruBalance.pruIndex,
      pruBalance.lastUsedAt,
      undefined, // lastSelectedPruIndex not available here
    );
    if (evaluation.canFund) {
      if (!bestSingle || evaluation.score > bestSingle.score) {
        bestSingle = { index: pruBalance.pruIndex, score: evaluation.score };
      }
    }
  }

  if (bestSingle) {
    return {
      strategy: "single_pru_full_fund",
      selectedPrus: [bestSingle.index],
      walletTopup: 0n,
      totalSpend: paymentAmount,
      feasible: true,
      alternatives,
      reasoning: `Single PRU-${bestSingle.index} can fully fund ${paymentAmount} (score: ${bestSingle.score})`,
    };
  }
  alternatives.push("single_pru_full_fund");

  // Strategy 2: Minimal multi-PRU set from ZK-PRUs only
  const multiStrategies = evaluateMultiPruStrategy(pruBalances, paymentAmount);
  if (multiStrategies.length > 0) {
    const best = multiStrategies.sort((a, b) => b.score - a.score)[0];
    if (best && best.prus.length <= 3) {
      return {
        strategy: "minimal_pru_set",
        selectedPrus: best.prus,
        walletTopup: 0n,
        totalSpend: paymentAmount,
        feasible: true,
        alternatives,
        reasoning: `Multi-PRU strategy with ${best.prus.length} PRUs funds ${paymentAmount} (score: ${best.score})`,
      };
    }
  }
  alternatives.push("minimal_pru_set");

  // Strategy 3: Check if wallet top-up can cover the shortfall
  let accumulated = 0n;
  const selectedPrus: number[] = [];

  // Sort by largest first for greedy fill
  const sortedForFill = [...pruBalances].sort((a, b) =>
    Number(b.availableBalance - a.availableBalance),
  );

  for (const pruBalance of sortedForFill) {
    if (accumulated >= paymentAmount) break;
    accumulated += pruBalance.availableBalance;
    selectedPrus.push(pruBalance.pruIndex);
  }

  if (accumulated < paymentAmount) {
    const needed = paymentAmount - accumulated;
    if (walletBalance >= needed) {
      return {
        strategy: "wallet_topup_required",
        selectedPrus,
        walletTopup: needed,
        totalSpend: accumulated + needed,
        feasible: true,
        alternatives,
        reasoning: `Selected ${selectedPrus.length} PRUs (${accumulated}) + wallet top-up (${needed})`,
      };
    }
    alternatives.push("wallet_topup_required");
    return {
      strategy: "multi_pru_fragmented",
      selectedPrus: [],
      walletTopup: 0n,
      totalSpend: 0n,
      feasible: false,
      alternatives,
      reasoning: `Insufficient total balance: need ${paymentAmount}, have ${accumulated + walletBalance}`,
    };
  }

  // Multi-PRU sufficient without wallet
  return {
    strategy: "multi_pru_fragmented",
    selectedPrus,
    walletTopup: 0n,
    totalSpend: accumulated,
    feasible: true,
    alternatives,
    reasoning: `Selected ${selectedPrus.length} PRUs with total ${accumulated} for payment ${paymentAmount}`,
  };
}

// ============================================================================
// Fee Calculation
// ============================================================================

/**
 * Unified fee calculation.
 *
 * TOTAL USER FEE =
 *   protocolAmountFee (paymentAmount * protocolFeeBps / 10000)
 * + multiPruSurcharge (if >1 PRU)
 * + estimatedNetworkCost (txCount * fixedCost + changeAccounts * creationCost)
 * + crankerReward (totalCostBeforeCranker * crankerRewardBps / 10000)
 *
 * Constraints:
 * - totalFee <= maxAuthorizedFee (user must approve maximum)
 * - crankerReward >= 0 (Cranker never operates at a loss)
 * - No additional fragmentation fees when planner itself created avoidable fragmentation
 */
export function calculateExecutionFees(input: {
  paymentAmountBaseUnits: bigint;
  selectedPruCount: number;
  changeOutputCount: number;
  walletTopupRequired: boolean;
  expectedTransactionCount: number;
  config: ExecutionPlannerConfig;
}): {
  protocolFeeBaseUnits: bigint;
  crankerRewardBaseUnits: bigint;
  estimatedNetworkFeeLamports: number;
  totalFeeBaseUnits: bigint;
} {
  const { config } = input;

  // 1. Protocol amount-based fee
  const protocolFeeBaseUnits =
    (input.paymentAmountBaseUnits * BigInt(config.protocolFeeBps)) / 10_000n;

  // 2. Multi-PRU surcharge: additional BPS per additional PRU
  const multiPruSurcharge =
    input.selectedPruCount > 1
      ? (BigInt(input.selectedPruCount - 1) *
          BigInt(config.multiPruSurchargeBps) *
          input.paymentAmountBaseUnits) /
        10_000n
      : 0n;

  // 3. Estimated network execution cost
  const estimatedNetworkFeeLamports =
    input.expectedTransactionCount * config.transactionFixedCostLamports +
    config.accountCreationCostLamports * input.changeOutputCount;

  // Convert network cost to token base units (approximate)
  const accountCreationCost =
    (BigInt(input.changeOutputCount) *
      BigInt(config.accountCreationCostLamports)) /
    BigInt(1_000_000);

  // 4. Wallet top-up surcharge (additional coordination cost)
  const walletTopupSurcharge = input.walletTopupRequired
    ? (input.paymentAmountBaseUnits * BigInt(config.protocolFeeBps)) / 10_000n
    : 0n;

  // 5. Cranker execution reward
  const totalCostBeforeCranker =
    protocolFeeBaseUnits + multiPruSurcharge + accountCreationCost + walletTopupSurcharge;
  const crankerRewardBaseUnits =
    (totalCostBeforeCranker * BigInt(config.crankerRewardBps)) / 10_000n;

  const totalFeeBaseUnits = totalCostBeforeCranker + crankerRewardBaseUnits;

  return {
    protocolFeeBaseUnits: protocolFeeBaseUnits + multiPruSurcharge + walletTopupSurcharge,
    crankerRewardBaseUnits,
    estimatedNetworkFeeLamports,
    totalFeeBaseUnits,
  };
}

// ============================================================================
// Tranche-Based Spending
// ============================================================================

/**
 * Calculates tranches for a selected PRU based on payment amount.
 *
 * Three cases:
 *
 * CASE 1: pruBalance <= paymentAmount (small balance, full consumption)
 *   - payment = paymentAmount
 *   - change = pruBalance - paymentAmount (if > 0)
 *   - source = RETIRED (entire balance consumed)
 *
 * CASE 2: pruBalance > paymentAmount AND paymentAmount >= standardTranche
 *   - payment = paymentAmount
 *   - change = pruBalance - paymentAmount
 *   - source = retained with new balance
 *
 * CASE 3: pruBalance > paymentAmount AND paymentAmount < standardTranche
 *   - Extract tranche from source
 *   - payment = paymentAmount
 *   - change = tranche - paymentAmount
 *   - source = retained with (pruBalance - tranche)
 *   - change destination = empty reserve PRU
 */
export function calculateSpendTranches(input: {
  pruBalance: bigint;
  paymentAmount: bigint;
  standardTrancheUsd: number;
  tokenUsd: number;
  assetDecimals: number;
}): Array<{ amount: bigint; destination: "payment" | "change" }> {
  const tranches: Array<{ amount: bigint; destination: "payment" | "change" }> =
    [];

  if (input.paymentAmount <= 0n) {
    return tranches;
  }

  // CASE 1: Source balance is less than or equal to payment amount
  // Full consumption of the source
  if (input.pruBalance <= input.paymentAmount) {
    tranches.push({ amount: input.paymentAmount, destination: "payment" });
    const change = input.pruBalance - input.paymentAmount;
    if (change > 0n) {
      tranches.push({ amount: change, destination: "change" });
    }
    return tranches;
  }

  // Source has more than payment amount
  const trancheBaseUnits = BigInt(
    Math.round(
      (input.standardTrancheUsd / input.tokenUsd) *
        Math.pow(10, input.assetDecimals),
    ),
  );

  // CASE 2: Payment is large enough (>= standard tranche)
  // Direct payment + remaining change
  if (input.paymentAmount >= trancheBaseUnits) {
    tranches.push({ amount: input.paymentAmount, destination: "payment" });
    const change = input.pruBalance - input.paymentAmount;
    if (change > 0n) {
      tranches.push({ amount: change, destination: "change" });
    }
    return tranches;
  }

  // CASE 3: Payment is small (< standard tranche)
  // Extract a tranche, send payment from tranche, change goes to fresh PRU
  const extractedTranche = trancheBaseUnits <= input.pruBalance
    ? trancheBaseUnits
    : input.pruBalance;

  tranches.push({ amount: input.paymentAmount, destination: "payment" });

  const changeFromTranche = extractedTranche - input.paymentAmount;
  if (changeFromTranche > 0n) {
    tranches.push({ amount: changeFromTranche, destination: "change" });
  }

  return tranches;
}

// ============================================================================
// Execution Plan Generation
// ============================================================================

/**
 * Deterministic hash of plan inputs for replay validation
 */
function hashPlanInputs(
  tinId: string,
  assetMint: string,
  paymentAmount: bigint,
  recipientIdentity: string,
  pruBalances: PruBalanceInfo[],
): string {
  const parts = [
    tinId,
    assetMint,
    paymentAmount.toString(),
    recipientIdentity,
    pruBalances.map((p) => `${p.pruIndex}:${p.availableBalance}`).join("|"),
  ].join("\n");

  return bytesToHex(sha256(utf8ToBytes(parts)));
}

/**
 * Generates a unique plan ID
 */
function generatePlanId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return "plan_" + bytesToHex(bytes);
}

/**
 * Main execution planner: generates a complete execution plan
 */
export function buildExecutionPlan(
  input: ExecutionPlannerInput,
  config: ExecutionPlannerConfig,
): ExecutionPlan {
  const planId = generatePlanId();
  const now = Date.now();
  const expiryTimestamp = Math.floor(
    (now + config.planTtlSeconds * 1000) / 1000,
  );

  // Step 1: Find optimal spend route
  const spendRoute = selectOptimalSpendRoute(
    input.availablePruBalances,
    input.walletAvailableBaseUnits,
    input.paymentAmountBaseUnits,
    config,
  );

  if (!spendRoute.feasible) {
    // Return a failed plan
    return {
      planId,
      version: 1,
      tinId: input.tinId,
      assetMint: input.assetMint,
      assetSymbol: input.assetSymbol,
      requestedAmountBaseUnits: input.paymentAmountBaseUnits,
      recipientIdentity: input.recipientIdentity,
      selectionStrategy: spendRoute.strategy,
      strategiesEvaluated: spendRoute.alternatives,
      selectedPrus: [],
      totalSpendFromPrus: 0n,
      walletTopupAmountBaseUnits: 0n,
      paymentOutput: {
        amount: input.paymentAmountBaseUnits,
        destination: input.recipientIdentity,
      },
      changeOutputs: [],
      totalChangeAmount: 0n,
      protocolFeeBaseUnits: 0n,
      estimatedNetworkFeeLamports: 0,
      crankerRewardBaseUnits: 0n,
      maxAuthorizedFeeBaseUnits: 0n,
      expectedInstructionCount: 0,
      expectedSolanaTransactionCount: 0,
      expectedChangeAccountCount: 0,
      status: "PLANNED",
      spendNonce: input.currentSpendNonce,
      expiryTimestamp,
      routePlanHash: "",
      decisions: {
        changeDestinationReasoning: "Plan failed: insufficient balance",
      },
      inputHash: hashPlanInputs(
        input.tinId,
        input.assetMint,
        input.paymentAmountBaseUnits,
        input.recipientIdentity,
        input.availablePruBalances,
      ),
    };
  }

  // Step 2: Build selected PRU details with tranches
  const selectedPrus: SelectedPruForSpend[] = [];
  const changeOutputs: ChangeOutput[] = [];
  let totalChangeAmount = 0n;
  let expectedChangeAccountCount = 0;

  // Available empty reserves to consume (copy so we can pop)
  const remainingEmptyReserves = [...input.emptyPruIndices];

  for (const pruIndex of spendRoute.selectedPrus) {
    const pruBalance = input.availablePruBalances.find(
      (p) => p.pruIndex === pruIndex,
    );
    if (!pruBalance) continue;

    const tranches = calculateSpendTranches({
      pruBalance: pruBalance.availableBalance,
      paymentAmount: input.paymentAmountBaseUnits,
      standardTrancheUsd: config.standardSpendTrancheUsd,
      tokenUsd: config.tokenUsd || 1,
      assetDecimals: input.assetDecimals,
    });

    let paymentAmount = 0n;
    let changeAmount = 0n;

    for (const tranche of tranches) {
      if (tranche.destination === "payment") {
        paymentAmount += tranche.amount;
      } else {
        changeAmount += tranche.amount;
      }
    }

    selectedPrus.push({
      pruIndex,
      balanceUsed: paymentAmount + changeAmount,
      balanceRemaining:
        pruBalance.availableBalance - (paymentAmount + changeAmount),
      tranches,
    });

    // Add change output if needed
    if (changeAmount > 0n) {
      // Consume next available empty reserve, or create new account
      const destinationPruIndex =
        remainingEmptyReserves.length > 0
          ? remainingEmptyReserves.shift()!
          : -1;
      const destinationType: ChangeDestinationType =
        destinationPruIndex >= 0 ? "empty_reserve" : "new_account";

      changeOutputs.push({
        amount: changeAmount,
        destinationPruIndex,
        destinationType,
        justification: `Tranche change from PRU-${pruIndex} -> ${destinationType === "empty_reserve" ? `PRU-${destinationPruIndex}` : "new account"}`,
      });

      totalChangeAmount += changeAmount;
      if (destinationType === "new_account") {
        expectedChangeAccountCount++;
      }
    }
  }

  // Step 3: Calculate fees
  const feeCalc = calculateExecutionFees({
    paymentAmountBaseUnits: input.paymentAmountBaseUnits,
    selectedPruCount: spendRoute.selectedPrus.length,
    changeOutputCount: expectedChangeAccountCount,
    walletTopupRequired: spendRoute.walletTopup > 0n,
    expectedTransactionCount: spendRoute.selectedPrus.length > 1 ? 2 : 1,
    config,
  });

  // Step 4: Calculate expected transactions
  let expectedTransactionCount = 1;
  if (spendRoute.selectedPrus.length > 1) {
    expectedTransactionCount = 2; // One for funding phase, one for settlement
  }
  if (spendRoute.walletTopup > 0n) {
    expectedTransactionCount++;
  }

  const expectedInstructionCount =
    3 + spendRoute.selectedPrus.length + expectedChangeAccountCount;

  // Build the plan
  const plan: ExecutionPlan = {
    planId,
    version: 1,
    tinId: input.tinId,
    assetMint: input.assetMint,
    assetSymbol: input.assetSymbol,
    requestedAmountBaseUnits: input.paymentAmountBaseUnits,
    recipientIdentity: input.recipientIdentity,
    selectionStrategy: spendRoute.strategy,
    strategiesEvaluated: spendRoute.alternatives,
    selectedPrus,
    totalSpendFromPrus: spendRoute.totalSpend,
    walletTopupAmountBaseUnits: spendRoute.walletTopup,
    paymentOutput: {
      amount: input.paymentAmountBaseUnits,
      destination: input.recipientIdentity,
    },
    changeOutputs,
    totalChangeAmount,
    protocolFeeBaseUnits: feeCalc.protocolFeeBaseUnits,
    estimatedNetworkFeeLamports: feeCalc.estimatedNetworkFeeLamports,
    estimatedNetworkFeeUsd: config.solUsd
      ? (feeCalc.estimatedNetworkFeeLamports / 1_000_000_000) * config.solUsd
      : undefined,
    crankerRewardBaseUnits: feeCalc.crankerRewardBaseUnits,
    crankerRewardUsd: config.tokenUsd
      ? (Number(feeCalc.crankerRewardBaseUnits) / Math.pow(10, 6)) *
        config.tokenUsd
      : undefined,
    maxAuthorizedFeeBaseUnits: feeCalc.totalFeeBaseUnits,
    expectedInstructionCount,
    expectedSolanaTransactionCount: expectedTransactionCount,
    expectedChangeAccountCount,
    status: "PLANNED",
    spendNonce: input.currentSpendNonce,
    expiryTimestamp,
    routePlanHash: hashPlanInputs(
      input.tinId,
      input.assetMint,
      input.paymentAmountBaseUnits,
      input.recipientIdentity,
      input.availablePruBalances,
    ),
    decisions: {
      whySinglePruSelected:
        spendRoute.strategy === "single_pru_full_fund"
          ? spendRoute.reasoning
          : undefined,
      whyMultiplePrusNeeded:
        spendRoute.strategy !== "single_pru_full_fund"
          ? spendRoute.reasoning
          : undefined,
      changeDestinationReasoning: `Routing change to ${expectedChangeAccountCount > 0 ? "new accounts" : "reserve PRUs"}`,
      walletTopupReasoning:
        spendRoute.walletTopup > 0n
          ? `Top-up ${spendRoute.walletTopup} from wallet`
          : undefined,
    },
    inputHash: hashPlanInputs(
      input.tinId,
      input.assetMint,
      input.paymentAmountBaseUnits,
      input.recipientIdentity,
      input.availablePruBalances,
    ),
  };

  return plan;
}

/**
 * Validates that a plan is still valid and hasn't expired
 */
function resolveFundingMode(
  selectedPrus: SelectedPruForSpend[],
  walletTopupAmountBaseUnits: bigint,
): ExecutionPlanFundingMode {
  if (selectedPrus.length > 0 && walletTopupAmountBaseUnits > 0n) {
    return "mixed_zk_pru_wallet_v2";
  }
  if (selectedPrus.length > 0) {
    return "zk_pru_only_v2";
  }
  return "wallet_only_v2";
}

function signExecutionPlanV2(
  planMessage: string,
  mainWalletSignature?: string | null,
) {
  // A digest is not a signature. The wallet must sign this exact message on
  // the authorized device; returning an explicit marker prevents callers
  // from mistaking a commitment for authorization.
  return mainWalletSignature?.trim() || "UNSIGNED_MAIN_WALLET_AUTHORIZATION";
}

export function buildExecutionPlanV2(
  input: ExecutionPlannerInput,
  config: ExecutionPlannerConfig,
): ExecutionPlan & {
  version: 2;
  fundingMode: ExecutionPlanFundingMode;
  scopedSpendAuthorizations: ScopedSpendAuthorization[];
  executionPlanSignatureMessage: string;
  executionPlanSignature: string;
  deviceAuthorizationState: {
    seedDecryptedLocally: boolean;
    derivedAuthorityCount: number;
  };
} {
  const basePlan = buildExecutionPlan(input, config);
  const fundingMode = resolveFundingMode(
    basePlan.selectedPrus,
    basePlan.walletTopupAmountBaseUnits,
  );
  const routePlanHash = `sha256:${basePlan.routePlanHash}`;
  const selectedPrus = basePlan.selectedPrus;
  const scopedSpendAuthorizations = selectedPrus.map((selectedPru, index) => {
    const amountBaseUnits = selectedPru.tranches
      .filter((tranche) => tranche.destination === "payment")
      .reduce((sum, tranche) => sum + tranche.amount, 0n)
      .toString();
    const nonce = input.currentSpendNonce + index + 1;
    const tsnVaultPubkey = input.tsnVaultPubkey ?? "tsn-vault";
    const intent = createScopedPruIntent({
      tinMasterSeed:
        typeof input.masterSeed === "string"
          ? utf8ToBytes(input.masterSeed)
          : input.masterSeed instanceof Uint8Array
            ? input.masterSeed
            : new Uint8Array(32).fill(0),
      tsnVaultPubkey,
      tin: input.tinId,
      pruIndex: selectedPru.pruIndex,
      amount: amountBaseUnits,
      recipientTin: input.recipientIdentity.replace(/^[^\d]*/, ""),
      intentId: `plan-${basePlan.planId}-${selectedPru.pruIndex}`,
      nowUnixSeconds: Math.floor(Date.now() / 1000),
      nonce,
    });
    return {
      pruIndex: selectedPru.pruIndex,
      amountBaseUnits,
      nonce,
      authorizationHash: bytesToHex(
        sha256(utf8ToBytes(intent.messageBytes.join(""))),
      ),
      authorizationMessage: JSON.stringify(intent.message),
      authorizationSignature: intent.pruSignature,
      authorityPublicKey: intent.pruPublicKey,
    };
  });

  const executionPlanSignatureMessage = [
    "Execution Plan V2",
    `PlanId: ${basePlan.planId}`,
    `Funding: ${fundingMode}`,
    `RouteHash: ${routePlanHash}`,
    `RequestedAmount: ${basePlan.requestedAmountBaseUnits.toString()}`,
    `WalletTopup: ${basePlan.walletTopupAmountBaseUnits.toString()}`,
    `SelectedPrus: ${selectedPrus.map((item) => item.pruIndex).join(",")}`,
  ].join("\n");

  return {
    ...basePlan,
    version: 2,
    fundingMode,
    routePlanHash,
    scopedSpendAuthorizations,
    executionPlanSignatureMessage,
    executionPlanSignature: signExecutionPlanV2(
      executionPlanSignatureMessage,
      input.mainWalletSignature,
    ),
    deviceAuthorizationState: {
      seedDecryptedLocally: Boolean(input.masterSeed),
      derivedAuthorityCount: scopedSpendAuthorizations.length,
    },
  };
}

export function validateExecutionPlan(plan: ExecutionPlan): {
  valid: boolean;
  reason?: string;
} {
  const now = Math.floor(Date.now() / 1000);

  if (plan.expiryTimestamp < now) {
    return { valid: false, reason: "Plan has expired" };
  }

  if (plan.status === "EXPIRED") {
    return { valid: false, reason: "Plan marked as expired" };
  }

  if (plan.status !== "PLANNED" && plan.status !== "AUTHORIZED") {
    return {
      valid: false,
      reason: `Plan status is ${plan.status}, not PLANNED or AUTHORIZED`,
    };
  }

  return { valid: true };
}
