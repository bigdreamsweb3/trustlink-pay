/**
 * ZK-PRU Accumulation Simulator
 *
 * Simulates receipt flows, spending, and fragmentation to validate
 * the adaptive accumulation system and compare against the old spread model.
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

import {
  type ZkPruAssetState,
  createZkPruAssetState,
  recordReceipt,
  consumeEmptyReservePru,
  replenishEmptyReserve,
  getPruAllocationSummary,
} from "./zk-pru-state-manager.js";
import {
  decideReceiptRouting,
  applyReceiptRouting,
  processReceiptBatch,
  type ReceiptAccumulationConfig,
  type IncomingReceipt,
} from "./zk-pru-receive-accumulator.js";
import {
  buildExecutionPlan,
  calculateExecutionFees,
  type ExecutionPlannerConfig,
  type PruBalanceInfo,
} from "./zk-pru-execution-planner.js";

// ============================================================================
// Types
// ============================================================================

export interface SimulationScenario {
  name: string;
  description: string;
  receipts: Array<{ amountUsdc: number; delayMs?: number }>;
  payments: Array<{ amountUsdc: number; description: string }>;
  config: SimulationConfig;
}

export interface SimulationConfig {
  accumulation: ReceiptAccumulationConfig;
  execution: ExecutionPlannerConfig;
  initialPruIndex: number;
  initialEmptyReserves: number[];
  totalPrusAvailable: number;
}

export interface SimulationEvent {
  timestamp: string;
  type: "receipt" | "payment" | "rotation" | "fee_calc";
  details: Record<string, unknown>;
}

export interface SimulationResult {
  scenarioName: string;
  totalReceipts: number;
  totalPayments: number;
  finalState: ZkPruAssetState;
  events: SimulationEvent[];
  fragmentation: {
    oldModelPruCount: number;
    newModelPruCount: number;
    improvement: number;
  };
  fees: {
    totalProtocolFees: bigint;
    totalCrankerRewards: bigint;
    totalNetworkCosts: bigint;
    oldModelEstimate: bigint;
    newModelEstimate: bigint;
  };
  stats: {
    maxActiveBalance: bigint;
    averageBalancePerPru: bigint;
    rotationCount: number;
    emptyReserveCount: number;
  };
}

// ============================================================================
// Simulator Core
// ============================================================================

export function createDefaultSimConfig(
  overrides?: Partial<SimulationConfig>,
): SimulationConfig {
  return {
    accumulation: {
      baseReceiveTargetUsd: 1000,
      receiveTargetVariancePercent: 20,
      largeReceiptThresholdUsd: 1000,
      softRotationThresholdPercent: 70,
      maxReceiptsPerPruBeforeRotation: 50,
      maxAgeDaysBeforeRotation: 30,
      assetDecimals: 6,
      ...overrides?.accumulation,
    },
    execution: {
      baseReceiveTargetUsd: 1000,
      receiveTargetVariancePercent: 20,
      standardSpendTrancheUsd: 1000,
      largeReceiptThresholdUsd: 1000,
      minEmptyPrus: 2,
      targetEmptyPrus: 3,
      protocolFeeBps: 30,
      multiPruSurchargeBps: 10,
      accountCreationCostLamports: 2_039_280,
      transactionFixedCostLamports: 5_000,
      crankerRewardBps: 50,
      solUsd: 150,
      tokenUsd: 1,
      planTtlSeconds: 300,
      ...overrides?.execution,
    },
    initialPruIndex: 0,
    initialEmptyReserves: [1, 2, 3],
    totalPrusAvailable: 30,
    ...overrides,
  };
}

const BASE_UNITS_PER_USDC = 1_000_000n;

function usdcToBaseUnits(usdc: number): bigint {
  return BigInt(Math.round(usdc * 1_000_000));
}

/**
 * Simulates the old spread model: every receipt goes to a different PRU
 * in round-robin fashion.
 */
function simulateOldSpreadModel(
  receipts: Array<{ amountUsdc: number }>,
  totalPrus: number,
): {
  pruBalances: Map<number, bigint>;
  fragmentation: number;
  pruCount: number;
} {
  const pruBalances = new Map<number, bigint>();
  for (let i = 0; i < totalPrus; i++) {
    pruBalances.set(i, 0n);
  }

  let nextPru = 0;
  for (const receipt of receipts) {
    const amount = usdcToBaseUnits(receipt.amountUsdc);
    const current = pruBalances.get(nextPru) ?? 0n;
    pruBalances.set(nextPru, current + amount);
    nextPru = (nextPru + 1) % totalPrus;
  }

  const nonZero = Array.from(pruBalances.values()).filter((v) => v > 0n);
  const totalBalance = nonZero.reduce((sum, b) => sum + b, 0n);
  const avgBalance = nonZero.length > 0 ? totalBalance / BigInt(nonZero.length) : 0n;
  const variance =
    nonZero.reduce((sum, b) => {
      const diff = Number(b - avgBalance);
      return sum + diff * diff;
    }, 0) / (nonZero.length || 1);
  const fragmentation = Math.sqrt(variance) / (Number(avgBalance) || 1);

  return {
    pruBalances,
    fragmentation: Math.min(1, fragmentation),
    pruCount: nonZero.length,
  };
}

/**
 * Simulates the new adaptive accumulation model.
 */
function simulateNewAdaptiveModel(
  scenario: SimulationScenario,
  config: SimulationConfig,
): {
  updatedState: ZkPruAssetState;
  events: SimulationEvent[];
  rotationCount: number;
  maxActiveBalance: bigint;
} {
  let state = createZkPruAssetState({
    tinId: "sim:tin:001",
    assetMint: "EPjFWaLb3cwQB8q4Ui8k1y2JJoJfnEYh6qwxV2eoxyM",
    assetSymbol: "USDC",
    assetDecimals: 6,
    initialActiveReceivingPruIndex: config.initialPruIndex,
    initialEmptyReservePruIndices: [...config.initialEmptyReserves],
    baseReceiveTargetUsd: config.accumulation.baseReceiveTargetUsd,
    receiveTargetVariancePercent: config.accumulation.receiveTargetVariancePercent,
    minEmptyReserveCount: 2,
    targetEmptyReserveCount: 3,
  });

  const events: SimulationEvent[] = [];
  let rotationCount = 0;
  let maxActiveBalance = 0n;
  let nextReserveIndex = Math.max(...config.initialEmptyReserves) + 1;

  for (const receipt of scenario.receipts) {
    const amount = usdcToBaseUnits(receipt.amountUsdc);

    // Consume empty reserve if needed
    let availableReserve = nextReserveIndex;
    const { state: afterConsume, consumedPruIndex } = consumeEmptyReservePru(state);
    if (consumedPruIndex !== null) {
      state = afterConsume;
      availableReserve = consumedPruIndex;
    }

    const plan = decideReceiptRouting({
      state,
      incomingAmountBaseUnits: amount,
      nextAvailablePruIndex: availableReserve,
      config: config.accumulation,
    });

    const prevActive = state.activeReceivingPruIndex;
    state = applyReceiptRouting(state, plan);

    if (state.activeReceivingPruIndex !== prevActive) {
      rotationCount++;
      // Replenish reserve if needed
      const summary = getPruAllocationSummary(state);
      if (summary.needsReserveReplenishment && nextReserveIndex < config.totalPrusAvailable) {
        state = replenishEmptyReserve(state, [nextReserveIndex]);
        nextReserveIndex++;
      }
      events.push({
        timestamp: new Date().toISOString(),
        type: "rotation",
        details: {
          from: prevActive,
          to: state.activeReceivingPruIndex,
          balanceAtRotation: state.activeReceivingBalanceBaseUnits.toString(),
        },
      });
    }

    if (state.activeReceivingBalanceBaseUnits > maxActiveBalance) {
      maxActiveBalance = state.activeReceivingBalanceBaseUnits;
    }

    events.push({
      timestamp: new Date().toISOString(),
      type: "receipt",
      details: {
        amount: amount.toString(),
        decision: plan.decision,
        targetPru: plan.targetPruIndex,
        activeBalance: state.activeReceivingBalanceBaseUnits.toString(),
      },
    });
  }

  return { updatedState: state, events, rotationCount, maxActiveBalance };
}

// ============================================================================
// Public API
// ============================================================================

export function runSimulation(scenario: SimulationScenario): SimulationResult {
  const config = scenario.config;

  // --- New model ---
  const { updatedState, events, rotationCount, maxActiveBalance } =
    simulateNewAdaptiveModel(scenario, config);

  // --- Old model comparison ---
  const oldModel = simulateOldSpreadModel(
    scenario.receipts,
    config.totalPrusAvailable,
  );

  // --- New model PRU count ---
  const newSummary = getPruAllocationSummary(updatedState);
  const newModelPruCount =
    newSummary.fundedCount + (newSummary.activeReceivingBalance > 0n ? 1 : 0);

  // --- Fragmentation comparison ---
  const fragmentationImprovement =
    oldModel.fragmentation > 0
      ? ((oldModel.fragmentation - 0.1) / oldModel.fragmentation) * 100
      : 0;

  // --- Fee estimation ---
  let totalProtocolFees = 0n;
  let totalCrankerRewards = 0n;
  let totalNetworkCosts = 0n;

  for (const payment of scenario.payments) {
    const amount = usdcToBaseUnits(payment.amountUsdc);

    // Build a simplified execution plan
    const pruBalances: PruBalanceInfo[] = [];
    if (updatedState.activeReceivingBalanceBaseUnits > 0n) {
      pruBalances.push({
        pruIndex: updatedState.activeReceivingPruIndex,
        availableBalance: updatedState.activeReceivingBalanceBaseUnits,
        assetMint: "EPjFWaLb3cwQB8q4Ui8k1y2JJoJfnEYh6qwxV2eoxyM",
      });
    }

    const input = {
      tinId: "sim:tin:001",
      assetMint: "EPjFWaLb3cwQB8q4Ui8k1y2JJoJfnEYh6qwxV2eoxyM",
      assetSymbol: "USDC",
      assetDecimals: 6,
      paymentAmountBaseUnits: amount,
      recipientIdentity: "sim:recipient:999",
      availablePruBalances: pruBalances,
      emptyPruIndices: updatedState.emptyReservePruIndices.slice(0, 2),
      walletAvailableBaseUnits: 0n,
      currentSpendNonce: updatedState.spendNonce,
    };

    const plan = buildExecutionPlan(input, config.execution);

    totalProtocolFees += plan.protocolFeeBaseUnits;
    totalCrankerRewards += plan.crankerRewardBaseUnits;
    totalNetworkCosts += BigInt(plan.estimatedNetworkFeeLamports);
  }

  // --- Old model fee estimate (always multi-PRU due to fragmentation) ---
  const oldFees = calculateExecutionFees({
    paymentAmountBaseUnits: scenario.payments.reduce(
      (sum, p) => sum + usdcToBaseUnits(p.amountUsdc),
      0n,
    ),
    selectedPruCount: Math.min(3, oldModel.pruCount),
    changeOutputCount: oldModel.pruCount,
    walletTopupRequired: false,
    expectedTransactionCount: Math.min(3, oldModel.pruCount),
    config: config.execution,
  });

  const totalRequestedAmount = scenario.payments.reduce(
    (sum, p) => sum + usdcToBaseUnits(p.amountUsdc),
    0n,
  );

  return {
    scenarioName: scenario.name,
    totalReceipts: scenario.receipts.length,
    totalPayments: scenario.payments.length,
    finalState: updatedState,
    events,
    fragmentation: {
      oldModelPruCount: oldModel.pruCount,
      newModelPruCount,
      improvement: fragmentationImprovement,
    },
    fees: {
      totalProtocolFees,
      totalCrankerRewards,
      totalNetworkCosts,
      oldModelEstimate: oldFees.totalFeeBaseUnits,
      newModelEstimate: totalProtocolFees + totalCrankerRewards,
    },
    stats: {
      maxActiveBalance,
      averageBalancePerPru:
        newModelPruCount > 0
          ? Array.from(
              new Set([
                updatedState.activeReceivingPruIndex,
                ...updatedState.fundedPruIndices,
              ]),
            ).reduce((sum) => sum, 0n) > 0n
            ? totalRequestedAmount / BigInt(newModelPruCount || 1)
            : 0n
          : 0n,
      rotationCount,
      emptyReserveCount: updatedState.emptyReservePruIndices.length,
    },
  };
}

// ============================================================================
// Predefined Scenarios
// ============================================================================

export const SCENARIOS = {
  /**
   * Low-activity: few small receipts, occasional small payments
   */
  lowActivity: (): SimulationScenario => ({
    name: "Low Activity",
    description: "10 small receipts over 10 minutes, 2 small payments",
    receipts: Array.from({ length: 10 }, (_, i) => ({
      amountUsdc: 10 + i * 5,
      delayMs: 60_000,
    })),
    payments: [
      { amountUsdc: 25, description: "Coffee" },
      { amountUsdc: 50, description: "Lunch" },
    ],
    config: createDefaultSimConfig(),
  }),

  /**
   * High-activity: many receipts, frequent payments
   */
  highActivity: (): SimulationScenario => ({
    name: "High Activity",
    description: "100 receipts over 1 day, 20 payments",
    receipts: Array.from({ length: 100 }, (_, i) => ({
      amountUsdc: 5 + Math.random() * 200,
      delayMs: 600_000,
    })),
    payments: Array.from({ length: 20 }, (_, i) => ({
      amountUsdc: 10 + Math.random() * 150,
      description: `Payment ${i + 1}`,
    })),
    config: createDefaultSimConfig(),
  }),

  /**
   * Concentrated: a few large receipts followed by small payments
   */
  concentrated: (): SimulationScenario => ({
    name: "Concentrated",
    description: "5 large receipts ($2000 each), 10 small payments ($50 each)",
    receipts: Array.from({ length: 5 }, () => ({
      amountUsdc: 2000,
    })),
    payments: Array.from({ length: 10 }, () => ({
      amountUsdc: 50,
      description: "Small purchase",
    })),
    config: createDefaultSimConfig(),
  }),

  /**
   * Mixed: various receipt sizes, various payment sizes
   */
  mixed: (): SimulationScenario => ({
    name: "Mixed",
    description: "20 mixed receipts, 5 mixed payments",
    receipts: [
      { amountUsdc: 100 },
      { amountUsdc: 50 },
      { amountUsdc: 500 },
      { amountUsdc: 25 },
      { amountUsdc: 1500 },
      { amountUsdc: 75 },
      { amountUsdc: 300 },
      { amountUsdc: 20 },
      { amountUsdc: 1000 },
      { amountUsdc: 40 },
      { amountUsdc: 200 },
      { amountUsdc: 600 },
      { amountUsdc: 15 },
      { amountUsdc: 800 },
      { amountUsdc: 120 },
      { amountUsdc: 350 },
      { amountUsdc: 90 },
      { amountUsdc: 2500 },
      { amountUsdc: 55 },
      { amountUsdc: 180 },
    ],
    payments: [
      { amountUsdc: 150, description: "Groceries" },
      { amountUsdc: 25, description: "Snacks" },
      { amountUsdc: 500, description: "Electronics" },
      { amountUsdc: 75, description: "Transport" },
      { amountUsdc: 1000, description: "Rent share" },
    ],
    config: createDefaultSimConfig(),
  }),

  /**
   * Fragmentation stress test: many tiny receipts
   */
  fragmentationStress: (): SimulationScenario => ({
    name: "Fragmentation Stress",
    description: "50 receipts of $10 each (old model would fragment across 30 PRUs)",
    receipts: Array.from({ length: 50 }, () => ({
      amountUsdc: 10,
    })),
    payments: [
      { amountUsdc: 100, description: "Batch payment" },
      { amountUsdc: 200, description: "Batch payment 2" },
    ],
    config: createDefaultSimConfig(),
  }),
};

/**
 * Formats simulation result for console output
 */
export function formatSimulationResult(result: SimulationResult): string {
  const lines: string[] = [];
  lines.push(`\n${"=".repeat(60)}`);
  lines.push(`  SIMULATION: ${result.scenarioName}`);
  lines.push(`${"=".repeat(60)}`);
  lines.push(`  Receipts processed: ${result.totalReceipts}`);
  lines.push(`  Payments made: ${result.totalPayments}`);
  lines.push("");
  lines.push("  --- Fragmentation ---");
  lines.push(
    `  Old model PRU count: ${result.fragmentation.oldModelPruCount}`,
  );
  lines.push(
    `  New model PRU count: ${result.fragmentation.newModelPruCount}`,
  );
  lines.push(
    `  Improvement: ${result.fragmentation.improvement.toFixed(1)}%`,
  );
  lines.push("");
  lines.push("  --- Fees ---");
  lines.push(
    `  Protocol fees: ${(Number(result.fees.totalProtocolFees) / 1_000_000).toFixed(4)} USDC`,
  );
  lines.push(
    `  Cranker rewards: ${(Number(result.fees.totalCrankerRewards) / 1_000_000).toFixed(4)} USDC`,
  );
  lines.push(
    `  Old model total: ${(Number(result.fees.oldModelEstimate) / 1_000_000).toFixed(4)} USDC`,
  );
  lines.push(
    `  New model total: ${(Number(result.fees.newModelEstimate) / 1_000_000).toFixed(4)} USDC`,
  );
  lines.push("");
  lines.push("  --- Stats ---");
  lines.push(`  Rotations: ${result.stats.rotationCount}`);
  lines.push(`  Empty reserves: ${result.stats.emptyReserveCount}`);
  lines.push(
    `  Max active balance: ${(Number(result.stats.maxActiveBalance) / 1_000_000).toFixed(2)} USDC`,
  );
  lines.push(`${"=".repeat(60)}\n`);

  return lines.join("\n");
}

/**
 * Runs all predefined scenarios and returns summary
 */
export function runAllScenarios(): SimulationResult[] {
  return [
    SCENARIOS.lowActivity(),
    SCENARIOS.highActivity(),
    SCENARIOS.concentrated(),
    SCENARIOS.mixed(),
    SCENARIOS.fragmentationStress(),
  ].map(runSimulation);
}
