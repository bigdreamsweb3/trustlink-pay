/**
 * ZK-PRU Receiving Accumulation
 * 
 * Replaces the deterministic spread allocation with smart accumulation:
 * - Single active receiving ZK-PRU per user/asset
 * - Accumulate small payments into active PRU
 * - Automatic rotation when reaching private receive target
 * - Separate handling for large receipts
 * 
 * This module handles receipt routing decisions that replace
 * the old allocatePrusDeterministically() function.
 */

import {
  type ZkPruAssetState,
  type RotationTarget,
  generateRotationTarget,
  isInSoftRotationRegion,
  determineRotationNeeded,
  rotateActiveReceivingPru,
  recordReceipt,
} from "./zk-pru-state-manager.js";

// ============================================================================
// Types
// ============================================================================

export type ReceiptRoutingDecision = "accumulate_to_active" | "route_to_new_pru" | "require_rotation";

export interface ReceiptRoutingPlan {
  decision: ReceiptRoutingDecision;
  targetPruIndex: number;
  amountToRoute: bigint;
  reasoning: string;
  rotationRequired: boolean;
  newRotationTarget?: RotationTarget;
}

export interface ReceiptAccumulationConfig {
  baseReceiveTargetUsd: number;
  receiveTargetVariancePercent: number;
  largeReceiptThresholdUsd: number;
  softRotationThresholdPercent: number;
  maxReceiptsPerPruBeforeRotation: number;
  maxAgeDaysBeforeRotation: number;
  assetDecimals: number;
}

// ============================================================================
// Receipt Routing Decisions
// ============================================================================

/**
 * Determines where a receipt should be routed.
 * 
 * Decision logic:
 * 1. If active PRU at/above target: require rotation
 * 2. If receipt is large (>threshold): route to new PRU
 * 3. If in soft rotation region: may rotate based on other factors
 * 4. Otherwise: accumulate to active PRU
 */
export function decideReceiptRouting(input: {
  state: ZkPruAssetState;
  incomingAmountBaseUnits: bigint;
  nextAvailablePruIndex: number;
  config: ReceiptAccumulationConfig;
}): ReceiptRoutingPlan {
  const { state, incomingAmountBaseUnits, nextAvailablePruIndex, config } = input;

  // Calculate if rotation is needed
  const rotationCheck = determineRotationNeeded({
    currentBalanceBaseUnits: state.activeReceivingBalanceBaseUnits,
    rotationTargetBaseUnits: state.receivingRotationTargetBaseUnits,
    softRotationThresholdPercent: config.softRotationThresholdPercent,
    receiptCountOnActivePru: state.receiptCountOnActivePru,
    lastRotationAt: state.lastRotationAt,
    maxReceiptsBeforeRotation: config.maxReceiptsPerPruBeforeRotation,
    maxAgeSecondsBeforeRotation: config.maxAgeDaysBeforeRotation * 86400,
  });

  // Decision 1: Rotation required
  if (rotationCheck.rotationNeeded) {
    return {
      decision: "require_rotation",
      targetPruIndex: nextAvailablePruIndex,
      amountToRoute: incomingAmountBaseUnits,
      reasoning: rotationCheck.reason ?? "Rotation required",
      rotationRequired: true,
    };
  }

  // Check if receipt is large
  const largeReceiptThresholdBaseUnits = BigInt(
    Math.round((config.largeReceiptThresholdUsd / 1) * Math.pow(10, config.assetDecimals)),
  );

  // Decision 2: Large receipt - route to separate PRU
  if (incomingAmountBaseUnits > largeReceiptThresholdBaseUnits) {
    const projectedBalanceAfterReceipt = state.activeReceivingBalanceBaseUnits + incomingAmountBaseUnits;

    // If adding receipt would exceed target by large margin, use separate PRU
    if (projectedBalanceAfterReceipt > state.receivingRotationTargetMaxBaseUnits) {
      return {
        decision: "route_to_new_pru",
        targetPruIndex: nextAvailablePruIndex,
        amountToRoute: incomingAmountBaseUnits,
        reasoning: `Large receipt ${incomingAmountBaseUnits} would exceed rotation target max (${state.receivingRotationTargetMaxBaseUnits})`,
        rotationRequired: false,
      };
    }
  }

  // Decision 3: Soft rotation region - make nuanced decision
  const { inRegion, percentOfTarget } = isInSoftRotationRegion({
    currentBalanceBaseUnits: state.activeReceivingBalanceBaseUnits,
    rotationTargetBaseUnits: state.receivingRotationTargetBaseUnits,
    softRotationThresholdPercent: config.softRotationThresholdPercent,
  });

  if (inRegion && percentOfTarget > 90) {
    // Very close to target: prefer new PRU to avoid overflow
    return {
      decision: "route_to_new_pru",
      targetPruIndex: nextAvailablePruIndex,
      amountToRoute: incomingAmountBaseUnits,
      reasoning: `Soft rotation: active PRU at ${percentOfTarget}% of target, route large receipt to new PRU`,
      rotationRequired: false,
    };
  }

  // Decision 4: Default - accumulate to active PRU
  return {
    decision: "accumulate_to_active",
    targetPruIndex: state.activeReceivingPruIndex,
    amountToRoute: incomingAmountBaseUnits,
    reasoning: `Accumulate to active PRU-${state.activeReceivingPruIndex}`,
    rotationRequired: false,
  };
}

/**
 * Applies a receipt routing decision to the state
 */
export function applyReceiptRouting(
  state: ZkPruAssetState,
  plan: ReceiptRoutingPlan,
): ZkPruAssetState {
  let updatedState = state;
 
  // Handle rotation if needed or when routing to a new PRU
  if (
    plan.rotationRequired ||
    (plan.decision !== "accumulate_to_active" && plan.targetPruIndex !== updatedState.activeReceivingPruIndex)
  ) {
    updatedState = rotateActiveReceivingPru(updatedState, plan.targetPruIndex);
  }
 
  // Record receipt on target PRU
  if (plan.targetPruIndex === updatedState.activeReceivingPruIndex) {
    updatedState = recordReceipt(updatedState, plan.amountToRoute);
  }
 
  return updatedState;
}

// ============================================================================
// Batch Receipt Processing
// ============================================================================

/**
 * Represents a single receipt to be processed
 */
export interface IncomingReceipt {
  receiptId: string;
  amountBaseUnits: bigint;
  txId: string;
  timestamp: string;
}

/**
 * Result of processing a receipt
 */
export interface ProcessedReceipt {
  receiptId: string;
  routed: boolean;
  targetPruIndex: number;
  decision: ReceiptRoutingDecision;
  reasoning: string;
}

/**
 * Processes a batch of receipts and updates state
 */
export function processReceiptBatch(input: {
  state: ZkPruAssetState;
  receipts: IncomingReceipt[];
  nextAvailablePruIndex: number;
  config: ReceiptAccumulationConfig;
}): {
  updatedState: ZkPruAssetState;
  processedReceipts: ProcessedReceipt[];
} {
  const { state: initialState, receipts, config } = input;
  let currentState = initialState;
  let nextPruIndex = input.nextAvailablePruIndex;
  const processed: ProcessedReceipt[] = [];

  for (const receipt of receipts) {
    // Determine routing for this receipt
    const plan = decideReceiptRouting({
      state: currentState,
      incomingAmountBaseUnits: receipt.amountBaseUnits,
      nextAvailablePruIndex: nextPruIndex,
      config,
    });

    // Apply the routing decision
    currentState = applyReceiptRouting(currentState, plan);

    // Increment next PRU if we used a new one
    if (plan.decision === "route_to_new_pru" || plan.decision === "require_rotation") {
      nextPruIndex++;
    }

    // Record the processing result
    processed.push({
      receiptId: receipt.receiptId,
      routed: true,
      targetPruIndex: plan.targetPruIndex,
      decision: plan.decision,
      reasoning: plan.reasoning,
    });
  }

  return {
    updatedState: currentState,
    processedReceipts: processed,
  };
}

// ============================================================================
// Migration from Old System
// ============================================================================

/**
 * Analyzes existing fragmented balances and suggests consolidation
 */
export function analyzeFragmentation(input: {
  tinId: string;
  assetMint: string;
  fragmentedPruBalances: Map<number, bigint>;
}): {
  totalBalance: bigint;
  pruCount: number;
  fragmentation: number; // 0-1, lower is better
  avgBalance: bigint;
  recommendations: string[];
} {
  const balances = Array.from(input.fragmentedPruBalances.values());
  const totalBalance = balances.reduce((sum, b) => sum + b, 0n);
  const pruCount = balances.length;

  if (pruCount === 0) {
    return {
      totalBalance: 0n,
      pruCount: 0,
      fragmentation: 0,
      avgBalance: 0n,
      recommendations: ["No existing balances"],
    };
  }

  const avgBalance = totalBalance / BigInt(pruCount);

  // Calculate fragmentation score (0 = all equal, 1 = highly unequal)
  const variance = balances.reduce((sum, b) => {
    const diff = Number(b - avgBalance);
    return sum + diff * diff;
  }, 0) / pruCount;
  const stdDev = Math.sqrt(variance);
  const fragmentation = Number(stdDev) / (Number(avgBalance) || 1);

  const recommendations: string[] = [];

  if (pruCount > 10) {
    recommendations.push(`High fragmentation: ${pruCount} PRUs with total ${totalBalance} base units`);
    recommendations.push(`Average balance per PRU: ${avgBalance} base units`);
    recommendations.push("Consider consolidation during low-activity period");
  }

  if (fragmentation > 0.5) {
    recommendations.push("Highly unequal balance distribution detected");
    recommendations.push("New accumulation system will prevent future fragmentation");
  }

  return {
    totalBalance,
    pruCount,
    fragmentation: Math.min(1, fragmentation),
    avgBalance,
    recommendations,
  };
}

/**
 * Creates a consolidation plan (for development/testing only)
 */
export function createConsolidationPlan(input: {
  tinId: string;
  assetMint: string;
  fragmentedPruIndices: number[];
  totalBalance: bigint;
  destinationPruIndex: number;
}): {
  operations: Array<{
    sourcePruIndex: number;
    destinationPruIndex: number;
    amount: bigint;
  }>;
  estimatedCost: bigint;
} {
  const operations = input.fragmentedPruIndices.map((sourcePruIndex) => ({
    sourcePruIndex,
    destinationPruIndex: input.destinationPruIndex,
    amount: input.totalBalance / BigInt(input.fragmentedPruIndices.length),
  }));

  // Estimate cost: one sweep transaction per source PRU
  const estimatedCost = BigInt(input.fragmentedPruIndices.length) * 5_000n; // Fixed cost per tx in lamports

  return { operations, estimatedCost };
}

// ============================================================================
// Statistics and Reporting
// ============================================================================

/**
 * Accumulation statistics for monitoring
 */
export interface AccumulationStatistics {
  activeReceivingPruIndex: number;
  activeBalance: bigint;
  percentOfTarget: number;
  receiptCountOnActive: number;
  fundedPruCount: number;
  sealedPruCount: number;
  emptyReserveCount: number;
  inSoftRotationRegion: boolean;
  rotationImminent: boolean;
}

/**
 * Gets statistics for monitoring the accumulation system
 */
export function getAccumulationStatistics(input: {
  state: ZkPruAssetState;
}): AccumulationStatistics {
  const { state } = input;
  const { inRegion, percentOfTarget } = isInSoftRotationRegion({
    currentBalanceBaseUnits: state.activeReceivingBalanceBaseUnits,
    rotationTargetBaseUnits: state.receivingRotationTargetBaseUnits,
    softRotationThresholdPercent: state.softRotationThresholdPercent,
  });

  return {
    activeReceivingPruIndex: state.activeReceivingPruIndex,
    activeBalance: state.activeReceivingBalanceBaseUnits,
    percentOfTarget,
    receiptCountOnActive: state.receiptCountOnActivePru,
    fundedPruCount: state.fundedPruIndices.size,
    sealedPruCount: state.sealedPruIndices.size,
    emptyReserveCount: state.emptyReservePruIndices.length,
    inSoftRotationRegion: inRegion,
    rotationImminent: percentOfTarget >= 90,
  };
}
