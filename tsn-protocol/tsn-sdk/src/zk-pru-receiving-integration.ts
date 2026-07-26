/**
 * ZK-PRU Receiving Integration Layer
 *
 * This module bridges the new adaptive accumulation logic with the existing
 * receipt processing pipeline. It intercepts incoming receipts and routes them
 * to a single active ZK-PRU per user/asset, replacing the old deterministic
 * spread allocation.
 *
 * Feature Flag: USE_ADAPTIVE_ZK_PRU_ACCUMULATION
 * Gradual Rollout: Can run alongside existing allocatePrusDeterministically()
 */

import { recordReceipt, createZkPruAssetState, determineRotationNeeded, rotateActiveReceivingPru } from "./zk-pru-state-manager.js";
import { decideReceiptRouting, applyReceiptRouting } from "./zk-pru-receive-accumulator.js";
import type { ZkPruAssetState } from "./zk-pru-state-manager.js";
import type { ReceiptRoutingDecision, ReceiptRoutingPlan, ReceiptAccumulationConfig } from "./zk-pru-receive-accumulator.js";

/**
 * Feature flag configuration - controls which receiving logic is active
 */
export interface ReceivingIntegrationConfig {
  /** Enable adaptive ZK-PRU accumulation (true) or use old spread allocation (false) */
  useAdaptiveAccumulation: boolean;

  /** Development mode: log all routing decisions */
  logRoutingDecisions: boolean;

  /** Base receiving target in USDC (default: 1000) */
  baseReceiveTargetUsd: number;

  /** Variance range as percentage (±20% = 800-1200 USDC) */
  receiveTargetVariancePercent: number;

  /** Soft rotation threshold as percentage of target (default: 70%) */
  softRotationThresholdPercent: number;

  /** Minimum empty PRU reserve to maintain */
  minEmptyPrus: number;
 
  /** Target empty PRU reserve to maintain */
  targetEmptyPrus: number;
 
  /** Standard spend tranche in USDC (default: 1000) */
  standardSpendTrancheUsd: number;
 
  /** Large receipt threshold in USDC (receives own PRU) */
  largeReceiptThresholdUsd: number;
 
  /** Maximum receipts on active PRU before soft rotation */
  maxReceiptsPerPruBeforeRotation: number;
 
  /** Maximum age of active PRU before soft rotation (days) */
  maxAgeDaysBeforeRotation: number;
}

/**
 * Default receiving integration configuration
 */
export const DEFAULT_RECEIVING_CONFIG: ReceivingIntegrationConfig = {
  useAdaptiveAccumulation: true,
  logRoutingDecisions: false,
  baseReceiveTargetUsd: 1000,
  receiveTargetVariancePercent: 20, // 800-1200 USDC range
  softRotationThresholdPercent: 70,
  minEmptyPrus: 2,
  targetEmptyPrus: 3,
  standardSpendTrancheUsd: 1000,
  largeReceiptThresholdUsd: 1500,
  maxReceiptsPerPruBeforeRotation: 10,
  maxAgeDaysBeforeRotation: 1,
};

/**
 * Incoming receipt metadata
 */
export interface IncomingReceiptMetadata {
  /** Receipt transaction ID for replay detection */
  txId: string;

  /** User TIN (Transfer Identity Number) */
  tinId: string;

  /** Asset mint address (e.g., USDC token address) */
  assetMint: string;

  /** Receipt amount in base units (e.g., 1_000_000 for 1 USDC with 6 decimals) */
  amountBaseUnits: bigint;

  /** Asset decimals (e.g., 6 for USDC) */
  assetDecimals: number;
  /** Asset symbol or human-readable label */
  assetSymbol?: string;

  /** Sender identity (for audit/privacy purposes) */
  senderIdentity?: string;

  /** Timestamp when receipt was generated */
  receivedAtTimestamp: number;

  /** Optional: existing PRU lifecycle data for state lookup */
  existingPruStates?: Map<number, "PLANNED" | "ACTIVE" | "USED" | "SWEPT">;
}

/**
 * Routing decision result
 */
export interface ReceiptRoutingResult {
  /** True if routing succeeded, false if error */
  success: boolean;
 
  /** Selected PRU index to receive this payment */
  selectedPruIndex?: number;
 
  /** Updated user/asset state after applying receipt */
  updatedState?: ZkPruAssetState;
 
  /** Routing decision metadata (for logging/audit) */
  decision?: ReceiptRoutingPlan;

  /** Error message if success=false */
  error?: string;

  /** Log entries for observability */
  logs: string[];
}

/**
 * In-memory state store for active receiving states
 * Production: should be replaced with persistent storage (database)
 */
class ReceivingStateStore {
  private states = new Map<string, ZkPruAssetState>();

  private stateKey(tinId: string, assetMint: string): string {
    return `${tinId}:${assetMint}`;
  }

  get(tinId: string, assetMint: string): ZkPruAssetState | undefined {
    return this.states.get(this.stateKey(tinId, assetMint));
  }

  set(tinId: string, assetMint: string, state: ZkPruAssetState): void {
    this.states.set(this.stateKey(tinId, assetMint), state);
  }

  delete(tinId: string, assetMint: string): boolean {
    return this.states.delete(this.stateKey(tinId, assetMint));
  }

  has(tinId: string, assetMint: string): boolean {
    return this.states.has(this.stateKey(tinId, assetMint));
  }

  listByTin(tinId: string): Array<{ assetMint: string; state: ZkPruAssetState }> {
    const results: Array<{ assetMint: string; state: ZkPruAssetState }> = [];
    for (const [key, state] of this.states) {
      if (key.startsWith(`${tinId}:`)) {
        const assetMint = key.split(":")[1];
        results.push({ assetMint, state });
      }
    }
    return results;
  }

  clear(): void {
    this.states.clear();
  }
}

/**
 * Global receiving state store
 * TODO: Replace with persistent backend storage
 */
const globalReceivingStateStore = new ReceivingStateStore();

/**
 * Get or create ZK-PRU receiving state for a user/asset combination
 *
 * @param tinId - User TIN
 * @param assetMint - Asset mint address
 * @param config - Receiving configuration
 * @param availablePruIndices - PRU indices available for this user
 * @returns Existing or newly created state
 */
export function getOrCreateReceivingState(
  tinId: string,
  assetMint: string,
  config: ReceivingIntegrationConfig,
  availablePruIndices: number[],
  assetDecimals: number,
  assetSymbol?: string,
): ZkPruAssetState {
  let state = globalReceivingStateStore.get(tinId, assetMint);

  if (!state) {
    const activeIndex = availablePruIndices[0] ?? 0;
    const reserveIndices = availablePruIndices.slice(1, 1 + config.targetEmptyPrus);

    // Create new state
    state = createZkPruAssetState({
      tinId,
      assetMint,
      assetSymbol: assetSymbol ?? assetMint,
      assetDecimals,
      initialActiveReceivingPruIndex: activeIndex,
      initialEmptyReservePruIndices: reserveIndices,
      baseReceiveTargetUsd: config.baseReceiveTargetUsd,
      receiveTargetVariancePercent: config.receiveTargetVariancePercent,
      minEmptyReserveCount: config.minEmptyPrus,
      targetEmptyReserveCount: config.targetEmptyPrus,
    });

    globalReceivingStateStore.set(tinId, assetMint, state);
  }

  return state;
}

/**
 * Process an incoming receipt with adaptive accumulation
 *
 * This is the main integration point where receipts enter the new system.
 * It replaces the old deterministic spread allocation with smart routing
 * to a single active PRU per user/asset.
 *
 * @param receipt - Incoming receipt metadata
 * @param config - Receiving configuration (uses defaults if not provided)
 * @returns Routing result with selected PRU index and updated state
 */
export function processIncomingReceipt(
  receipt: IncomingReceiptMetadata,
  config: Partial<ReceivingIntegrationConfig> = {},
): ReceiptRoutingResult {
  const finalConfig = { ...DEFAULT_RECEIVING_CONFIG, ...config };
  const logs: string[] = [];

  try {
    // Step 1: Verify feature flag
    if (!finalConfig.useAdaptiveAccumulation) {
      return {
        success: false,
        error: "Adaptive ZK-PRU accumulation is disabled (use allocatePrusDeterministically instead)",
        logs,
      };
    }

    // Step 2: Get or create receiving state
    const availablePruIndices = Array.from({ length: 30 }, (_, i) => i); // Assuming 30 PRUs per user (DEFAULT_PRU_COUNT)
    const state = getOrCreateReceivingState(
      receipt.tinId,
      receipt.assetMint,
      finalConfig,
      availablePruIndices,
      receipt.assetDecimals,
      receipt.assetSymbol,
    );
 
    logs.push(
      `[ReceivingIntegration] Processing receipt: TIN=${receipt.tinId} Asset=${receipt.assetMint} Amount=${receipt.amountBaseUnits}`,
    );
    logs.push(
      `[ReceivingIntegration] Active receiving PRU: ${state.activeReceivingPruIndex}, Balance: ${state.activeReceivingBalanceBaseUnits}`,
    );
 
    // Step 3: Decide routing (adaptive accumulation or rotation)
    const nextAvailablePruIndex = state.emptyReservePruIndices[0] ?? (state.activeReceivingPruIndex + 1);
    const decision = decideReceiptRouting({
      state,
      incomingAmountBaseUnits: receipt.amountBaseUnits,
      nextAvailablePruIndex,
      config: {
        baseReceiveTargetUsd: finalConfig.baseReceiveTargetUsd,
        receiveTargetVariancePercent: finalConfig.receiveTargetVariancePercent,
        largeReceiptThresholdUsd: finalConfig.largeReceiptThresholdUsd,
        softRotationThresholdPercent: finalConfig.softRotationThresholdPercent,
        maxReceiptsPerPruBeforeRotation: finalConfig.maxReceiptsPerPruBeforeRotation,
        maxAgeDaysBeforeRotation: finalConfig.maxAgeDaysBeforeRotation,
        assetDecimals: receipt.assetDecimals,
      },
    });
 
    logs.push(`[ReceivingIntegration] Routing decision: ${decision.decision} to PRU ${decision.targetPruIndex}`);

    // Step 4: Apply routing decision to state
    const updatedState = applyReceiptRouting(state, decision);
 
    // Step 5: Check if rotation is needed (soft rotation region logic)
    const rotationCheck = determineRotationNeeded({
      currentBalanceBaseUnits: updatedState.activeReceivingBalanceBaseUnits,
      rotationTargetBaseUnits: updatedState.receivingRotationTargetBaseUnits,
      softRotationThresholdPercent: finalConfig.softRotationThresholdPercent,
      receiptCountOnActivePru: updatedState.receiptCountOnActivePru,
      lastRotationAt: updatedState.lastRotationAt,
    });

    if (rotationCheck.rotationNeeded) {
      logs.push(
        `[ReceivingIntegration] Soft rotation triggered: balance=${updatedState.activeReceivingBalanceBaseUnits}, target=${updatedState.receivingRotationTargetBaseUnits}`,
      );

      // Rotate to new active PRU
      const rotatedState = rotateActiveReceivingPru(updatedState, nextAvailablePruIndex);
      globalReceivingStateStore.set(receipt.tinId, receipt.assetMint, rotatedState);

      return {
        success: true,
        selectedPruIndex: rotatedState.activeReceivingPruIndex,
        updatedState: rotatedState,
        decision,
        logs,
      };
    }

    // Step 6: Record receipt in state
    const recordedState = recordReceipt(updatedState, receipt.amountBaseUnits);

    // Persist updated state
    globalReceivingStateStore.set(receipt.tinId, receipt.assetMint, recordedState);

    if (finalConfig.logRoutingDecisions) {
      logs.forEach((log) => console.log(log));
    }

    return {
      success: true,
      selectedPruIndex: recordedState.activeReceivingPruIndex,
      updatedState: recordedState,
      decision,
      logs,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logs.push(`[ReceivingIntegration] ERROR: ${errorMsg}`);

    return {
      success: false,
      error: errorMsg,
      logs,
    };
  }
}

/**
 * Get fragmentation analysis for a user/asset
 *
 * Returns statistics about current balance fragmentation and recommendations
 */
export function analyzeReceivingFragmentation(
  tinId: string,
  assetMint: string,
  fundedPruBalances: Map<number, bigint>,
): {
  fragmentationRatio: number;
  fundedPruCount: number;
  totalBalance: bigint;
  averageBalance: bigint;
  recommendation: string;
  consolidationNeeded: boolean;
} {
  const state = globalReceivingStateStore.get(tinId, assetMint);
  if (!state) {
    return {
      fragmentationRatio: 0,
      fundedPruCount: 0,
      totalBalance: 0n,
      averageBalance: 0n,
      recommendation: "No receiving state found",
      consolidationNeeded: false,
    };
  }

  const fundedCount = state.fundedPruIndices.size;
  const totalBalance = Array.from(fundedPruBalances.values()).reduce((sum, bal) => sum + bal, 0n);
  const averageBalance = fundedCount > 0 ? totalBalance / BigInt(fundedCount) : 0n;

  // Calculate fragmentation ratio (ideal is 1.0 for single funded PRU)
  const fragmentationRatio = fundedCount > 0 ? fundedCount : 0;

  const consolidationNeeded = fragmentationRatio > 3;

  let recommendation = `Current: ${fundedCount} funded PRU(s), ${totalBalance} total balance`;
  if (consolidationNeeded) {
    recommendation += " - Consider consolidation to reduce transaction costs";
  } else if (fundedCount <= 1) {
    recommendation += " - Optimal fragmentation";
  } else {
    recommendation += " - Monitor; consolidate if transaction costs become excessive";
  }

  return {
    fragmentationRatio,
    fundedPruCount: fundedCount,
    totalBalance,
    averageBalance,
    recommendation,
    consolidationNeeded,
  };
}

/**
 * Reset receiving state for a user/asset (development/testing only)
 */
export function resetReceivingState(tinId: string, assetMint?: string): void {
  if (assetMint) {
    globalReceivingStateStore.delete(tinId, assetMint);
  } else {
    // Clear all states for this TIN
    const states = globalReceivingStateStore.listByTin(tinId);
    states.forEach(({ assetMint: mint }) => {
      globalReceivingStateStore.delete(tinId, mint);
    });
  }
}

/**
 * Get all receiving states for a user
 * Useful for debugging and analytics
 */
export function getUserReceivingStates(tinId: string): Array<{ assetMint: string; state: ZkPruAssetState }> {
  return globalReceivingStateStore.listByTin(tinId);
}
