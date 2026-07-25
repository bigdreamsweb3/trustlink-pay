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
}

// ============================================================================
// Spend Selection Algorithm
// ============================================================================

/**
 * Evaluates whether a single PRU can fully fund the payment
 * and returns the score if it can.
 */
function evaluateSinglePruFullFund(
  pruBalance: bigint,
  paymentAmount: bigint,
  pruIndex: number,
  lastUsedAt?: string,
): { canFund: boolean; score: number } {
  if (pruBalance < paymentAmount) {
    return { canFund: false, score: 0 };
  }

  // Score factors: prefer less-recently-used to avoid patterns
  const recencyScore = lastUsedAt
    ? 100 - Math.min(99, Math.floor(Date.now() / 1000) % 100)
    : 50;
  const balanceEfficacy = paymentAmount === pruBalance ? 100 : 90; // Exact match is best
  const score = (recencyScore + balanceEfficacy) / 2;

  return { canFund: true, score };
}

/**
 * Evaluates a multi-PRU selection strategy
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

  // Greedy selection: take largest balances until satisfied
  const sorted = [...balances].sort((a, b) =>
    Number(b.availableBalance - a.availableBalance),
  );

  let accumulated = 0n;
  let selectedIndices: number[] = [];

  for (const pru of sorted) {
    if (accumulated >= paymentAmount) break;
    accumulated += pru.availableBalance;
    selectedIndices.push(pru.pruIndex);
  }

  if (accumulated >= paymentAmount) {
    const change = accumulated - paymentAmount;
    // Penalize multi-PRU strategies: fewer PRUs is better
    const pruPenalty =
      selectedIndices.length > 1 ? (selectedIndices.length - 1) * 10 : 0;
    const score = Math.max(0, 50 - pruPenalty);
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
 * Main spend selection algorithm
 * Priority:
 * 1. Single PRU that can fully fund
 * 2. Multi-PRU with minimal count
 * 3. Wallet top-up if needed
 * 4. Fail if insufficient
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
  let selectedPrus: number[] = [];
  let walletTopup = 0n;
  let totalSpend = 0n;

  // Strategy 1: Find single PRU that can fully fund
  for (const pruBalance of pruBalances) {
    const evaluation = evaluateSinglePruFullFund(
      pruBalance.availableBalance,
      paymentAmount,
      pruBalance.pruIndex,
      pruBalance.lastUsedAt,
    );
    if (evaluation.canFund) {
      return {
        strategy: "single_pru_full_fund",
        selectedPrus: [pruBalance.pruIndex],
        walletTopup: 0n,
        totalSpend: paymentAmount,
        feasible: true,
        alternatives,
        reasoning: `Single PRU-${pruBalance.pruIndex} with ${pruBalance.availableBalance} can fully fund ${paymentAmount}`,
      };
    }
  }

  alternatives.push("single_pru_full_fund");

  // Strategy 2: Minimal multi-PRU set from ZK-PRUs only
  const multiStrategies = evaluateMultiPruStrategy(pruBalances, paymentAmount);
  if (multiStrategies.length > 0) {
    const best = multiStrategies.sort((a, b) => b.score - a.score)[0];
    if (best && best.prus.length <= 3) {
      // Max 3 PRUs reasonable; beyond that consider wallet
      return {
        strategy: "minimal_pru_set",
        selectedPrus: best.prus,
        walletTopup: 0n,
        totalSpend: paymentAmount,
        feasible: true,
        alternatives,
        reasoning: `Multi-PRU strategy with ${best.prus.length} PRUs can fund ${paymentAmount}`,
      };
    }
  }

  alternatives.push("minimal_pru_set");

  // Strategy 3: Multi-PRU fragmented or wallet top-up
  let accumulated = 0n;
  selectedPrus = [];

  for (const pruBalance of pruBalances) {
    if (accumulated >= paymentAmount) break;
    accumulated += pruBalance.availableBalance;
    selectedPrus.push(pruBalance.pruIndex);
  }

  if (accumulated < paymentAmount) {
    // Need wallet top-up
    const needed = paymentAmount - accumulated;
    if (walletBalance >= needed) {
      walletTopup = needed;
      totalSpend = accumulated + walletTopup;
      return {
        strategy: "wallet_topup_required",
        selectedPrus,
        walletTopup,
        totalSpend,
        feasible: true,
        alternatives,
        reasoning: `Selected ${selectedPrus.length} PRUs (${accumulated} available) + wallet top-up (${needed})`,
      };
    }

    // Insufficient funds
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

  // Multi-PRU but sufficient
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
 * Calculates execution fees based on plan characteristics
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

  // Base protocol fee: BPS on payment amount
  const baseFeeBaseUnits =
    (input.paymentAmountBaseUnits * BigInt(config.protocolFeeBps)) / 10_000n;

  // Multi-PRU surcharge: additional BPS per additional PRU (on top of base fee)
  const multiPruSurchargeAmount =
    input.selectedPruCount > 1
      ? (BigInt(input.selectedPruCount - 1) *
          BigInt(config.multiPruSurchargeBps) *
          input.paymentAmountBaseUnits) /
        10_000n
      : 0n;

  const protocolFeeBaseUnits = baseFeeBaseUnits + multiPruSurchargeAmount;

  // Account creation cost: per new change account (convert lamports to base units)
  const accountCreationCost =
    (BigInt(input.changeOutputCount) *
      BigInt(config.accountCreationCostLamports)) /
    BigInt(1_000_000); // Assuming 6-decimal conversion

  // Transaction cost
  const estimatedNetworkFeeLamports =
    input.expectedTransactionCount * config.transactionFixedCostLamports +
    config.accountCreationCostLamports * input.changeOutputCount;

  // Wallet top-up surcharge
  const walletTopupSurcharge = input.walletTopupRequired
    ? (input.paymentAmountBaseUnits * BigInt(config.protocolFeeBps)) / 10_000n
    : 0n;

  // Cranker reward: BPS on total cost
  const totalCostBeforeCranker =
    protocolFeeBaseUnits +
    accountCreationCost +
    walletTopupSurcharge;
  const crankerRewardBaseUnits =
    (totalCostBeforeCranker * BigInt(config.crankerRewardBps)) / 10_000n;

  const totalFeeBaseUnits = totalCostBeforeCranker + crankerRewardBaseUnits;

  return {
    protocolFeeBaseUnits,
    crankerRewardBaseUnits,
    estimatedNetworkFeeLamports,
    totalFeeBaseUnits,
  };
}

// ============================================================================
// Tranche-Based Spending
// ============================================================================

/**
 * Calculates tranches for a selected PRU based on payment amount
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

  // Calculate tranche in base units
  const trancheBaseUnits = BigInt(
    Math.round(
      (input.standardTrancheUsd / input.tokenUsd) *
        Math.pow(10, input.assetDecimals),
    ),
  );

  // If PRU balance <= payment amount, no tranche extraction
  if (input.pruBalance <= input.paymentAmount) {
    tranches.push({ amount: input.paymentAmount, destination: "payment" });
    if (input.pruBalance > input.paymentAmount) {
      tranches.push({
        amount: input.pruBalance - input.paymentAmount,
        destination: "change",
      });
    }
    return tranches;
  }

  // PRU has more than payment amount
  if (input.paymentAmount >= trancheBaseUnits) {
    // Payment is large enough; no tranche extraction
    tranches.push({ amount: input.paymentAmount, destination: "payment" });
    tranches.push({
      amount: input.pruBalance - input.paymentAmount,
      destination: "change",
    });
  } else {
    // Payment is small; extract tranche and send change
    tranches.push({ amount: input.paymentAmount, destination: "payment" });
    // Change is: tranche - payment, but capped by available balance
    const maxChangeFromBalance = input.pruBalance - input.paymentAmount;
    const changeAmount = trancheBaseUnits <= maxChangeFromBalance
      ? trancheBaseUnits - input.paymentAmount
      : maxChangeFromBalance;
    if (changeAmount > 0n) {
      tranches.push({ amount: changeAmount, destination: "change" });
    }
    // Source PRU retains the remainder (stays in source)
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
      const destinationType: ChangeDestinationType =
        input.emptyPruIndices.length > 0 ? "empty_reserve" : "new_account";
      const destinationPruIndex =
        input.emptyPruIndices.length > 0 ? input.emptyPruIndices[0] : -1;

      changeOutputs.push({
        amount: changeAmount,
        destinationPruIndex,
        destinationType,
        justification: `Tranche change from PRU-${pruIndex}`,
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
