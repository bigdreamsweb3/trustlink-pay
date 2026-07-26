/**
 * ZK-PRU State Manager
 *
 * Manages per-user, per-asset ZK-PRU state including:
 * - Active receiving PRU
 * - Empty reserves
 * - Funded/sealed/retired tracking
 * - Rotation targets and soft rotation region
 * - Spend nonce for replay protection
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

// ============================================================================
// Types and Interfaces
// ============================================================================

export type PruLifecycleStatus =
  | "empty"
  | "active_receiving"
  | "funded"
  | "sealed_spend_only"
  | "retired";

/**
 * Per-user, per-asset ZK-PRU state
 */
export interface ZkPruAssetState {
  tinId: string;
  assetMint: string;
  assetSymbol: string;
  assetDecimals: number;

  // Receiving
  activeReceivingPruIndex: number;
  activeReceivingBalanceBaseUnits: bigint;

  // Rotation targets (in base units)
  receivingRotationTargetBaseUnits: bigint; // Private target, e.g., 1000 USDC
  receivingRotationTargetMinBaseUnits: bigint; // e.g., 800 USDC
  receivingRotationTargetMaxBaseUnits: bigint; // e.g., 1200 USDC
  rotationTargetGeneratedAt: string; // ISO timestamp
  rotationTargetNonce: number; // For deterministic generation

  // Soft rotation region (70-100% of target)
  softRotationThresholdPercent: number; // e.g., 70

  // Receiving metadata
  receiptCountOnActivePru: number;
  lastReceiptAtOnActivePru: string; // ISO timestamp
  lastRotationAt: string; // ISO timestamp

  // Reserves
  emptyReservePruIndices: number[]; // Pre-created empty PRUs
  minEmptyReserveCount: number;
  targetEmptyReserveCount: number;

  // Spending
  spendNonce: number; // For replay protection
  lastSpendAt: string; // ISO timestamp
  lastSelectedPruIndex?: number; // To avoid repeated patterns

  // Lifecycle tracking
  fundedPruIndices: Set<number>;
  sealedPruIndices: Set<number>; // Spend-only
  retiredPruIndices: Set<number>;

  // Metadata
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * Rotation target with privacy variance
 */
export interface RotationTarget {
  targetBaseUnits: bigint;
  minBaseUnits: bigint;
  maxBaseUnits: bigint;
  generatedAt: string;
  nonce: number;
}

/**
 * State transition record
 */
export interface StateTransition {
  timestamp: string;
  fromState: PruLifecycleStatus;
  toState: PruLifecycleStatus;
  reason: string;
}

// ============================================================================
// State Manager
// ============================================================================

/**
 * Creates a new per-user, per-asset ZK-PRU state
 */
export function createZkPruAssetState(input: {
  tinId: string;
  assetMint: string;
  assetSymbol: string;
  assetDecimals: number;
  initialActiveReceivingPruIndex: number;
  initialEmptyReservePruIndices: number[];
  baseReceiveTargetUsd: number;
  receiveTargetVariancePercent: number;
  minEmptyReserveCount: number;
  targetEmptyReserveCount: number;
}): ZkPruAssetState {
  const now = new Date().toISOString();

  // Generate rotation target with variance
  const targetBaseUnits = BigInt(
    Math.round(
      (input.baseReceiveTargetUsd / 1) * Math.pow(10, input.assetDecimals),
    ),
  ); // Assuming token = 1 USD for now
  const varianceAmount =
    (targetBaseUnits * BigInt(input.receiveTargetVariancePercent)) / 100n;
  const minBaseUnits = targetBaseUnits - varianceAmount;
  const maxBaseUnits = targetBaseUnits + varianceAmount;

  return {
    tinId: input.tinId,
    assetMint: input.assetMint,
    assetSymbol: input.assetSymbol,
    assetDecimals: input.assetDecimals,

    activeReceivingPruIndex: input.initialActiveReceivingPruIndex,
    activeReceivingBalanceBaseUnits: 0n,

    receivingRotationTargetBaseUnits: targetBaseUnits,
    receivingRotationTargetMinBaseUnits: minBaseUnits,
    receivingRotationTargetMaxBaseUnits: maxBaseUnits,
    rotationTargetGeneratedAt: now,
    rotationTargetNonce: 0,

    softRotationThresholdPercent: 70,

    receiptCountOnActivePru: 0,
    lastReceiptAtOnActivePru: now,
    lastRotationAt: now,

    emptyReservePruIndices: input.initialEmptyReservePruIndices,
    minEmptyReserveCount: input.minEmptyReserveCount,
    targetEmptyReserveCount: input.targetEmptyReserveCount,

    spendNonce: 0,
    lastSpendAt: now,
    lastSelectedPruIndex: undefined,

    fundedPruIndices: new Set([input.initialActiveReceivingPruIndex]),
    sealedPruIndices: new Set(),
    retiredPruIndices: new Set(),

    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

/**
 * Generates a private rotation target with variance.
 *
 * Uses a deterministic HMAC-style construction so that:
 * - the target is predictable for authorised TSN components that know the seed
 * - a public observer cannot predict the exact rotation point
 * - no two users rotate at exactly the same visible threshold
 */
export function generateRotationTarget(input: {
  baseReceiveTargetUsd: number;
  receiveTargetVariancePercent: number;
  assetDecimals: number;
  deterministicSeed: string;
}): RotationTarget {
  const seedBytes = utf8ToBytes(input.deterministicSeed);
  const hash = sha256(seedBytes);
  const hashValue = parseInt(bytesToHex(hash).substring(0, 8), 16);

  // Deterministic variance within ±configured percent
  const varianceRange = input.receiveTargetVariancePercent;
  const rawVariance = (hashValue % (varianceRange * 2)) - varianceRange;

  const targetBaseUnits = BigInt(
    Math.round(input.baseReceiveTargetUsd * Math.pow(10, input.assetDecimals)),
  );
  const varianceAmount =
    (targetBaseUnits * BigInt(Math.abs(rawVariance))) / 100n;

  const minBaseUnits =
    rawVariance >= 0
      ? targetBaseUnits
      : targetBaseUnits - varianceAmount;
  const maxBaseUnits =
    rawVariance >= 0
      ? targetBaseUnits + varianceAmount
      : targetBaseUnits;

  return {
    targetBaseUnits,
    minBaseUnits,
    maxBaseUnits,
    generatedAt: new Date().toISOString(),
    nonce: hashValue % 0x7fffffff,
  };
}

/**
 * Checks if active receiving PRU is in soft rotation region
 */
export function isInSoftRotationRegion(input: {
  currentBalanceBaseUnits: bigint;
  rotationTargetBaseUnits: bigint;
  softRotationThresholdPercent: number;
}): { inRegion: boolean; percentOfTarget: number } {
  const percentOfTarget = Number(
    (input.currentBalanceBaseUnits * 100n) / input.rotationTargetBaseUnits,
  );
  const thresholdPercent = input.softRotationThresholdPercent;
  const inRegion = percentOfTarget >= thresholdPercent && percentOfTarget < 100;

  return { inRegion, percentOfTarget };
}

/**
 * Determines if rotation is required
 */
export function determineRotationNeeded(input: {
  currentBalanceBaseUnits: bigint;
  rotationTargetBaseUnits: bigint;
  softRotationThresholdPercent: number;
  receiptCountOnActivePru: number;
  lastRotationAt: string;
  maxReceiptsBeforeRotation?: number;
  maxAgeSecondsBeforeRotation?: number;
}): { rotationNeeded: boolean; reason?: string } {
  const { inRegion, percentOfTarget } = isInSoftRotationRegion({
    currentBalanceBaseUnits: input.currentBalanceBaseUnits,
    rotationTargetBaseUnits: input.rotationTargetBaseUnits,
    softRotationThresholdPercent: input.softRotationThresholdPercent,
  });

  // Must rotate if at or above target
  if (percentOfTarget >= 100) {
    return {
      rotationNeeded: true,
      reason: `Balance at ${percentOfTarget}% of target (must rotate)`,
    };
  }

  // In soft rotation region: may rotate based on other factors
  if (inRegion) {
    const maxReceipts = input.maxReceiptsBeforeRotation || 10;
    if (input.receiptCountOnActivePru >= maxReceipts) {
      return {
        rotationNeeded: true,
        reason: `Soft rotation: ${input.receiptCountOnActivePru} receipts >= threshold ${maxReceipts}`,
      };
    }

    const maxAgeSeconds = input.maxAgeSecondsBeforeRotation || 3600; // 1 hour default
    const ageSeconds =
      (Date.now() - new Date(input.lastRotationAt).getTime()) / 1000;
    if (ageSeconds >= maxAgeSeconds) {
      return {
        rotationNeeded: true,
        reason: `Soft rotation: age ${ageSeconds}s >= threshold ${maxAgeSeconds}s`,
      };
    }
  }

  // No rotation needed
  return { rotationNeeded: false };
}

/**
 * Rotates to a new active receiving PRU
 */
export function rotateActiveReceivingPru(
  state: ZkPruAssetState,
  newPruIndex: number,
): ZkPruAssetState {
  const now = new Date().toISOString();
  const newSealed = new Set(state.sealedPruIndices);
  const newFunded = new Set(state.fundedPruIndices);

  // Seal the old active PRU if it has balance
  if (state.activeReceivingBalanceBaseUnits > 0n) {
    newSealed.add(state.activeReceivingPruIndex);
    newFunded.delete(state.activeReceivingPruIndex);
  }

  return {
    ...state,
    activeReceivingPruIndex: newPruIndex,
    activeReceivingBalanceBaseUnits: 0n,
    receiptCountOnActivePru: 0,
    lastReceiptAtOnActivePru: now,
    lastRotationAt: now,
    fundedPruIndices: new Set([...newFunded, newPruIndex]),
    sealedPruIndices: newSealed,
    updatedAt: now,
    version: state.version + 1,
  };
}

/**
 * Records a receipt on the active receiving PRU
 */
export function recordReceipt(
  state: ZkPruAssetState,
  amountBaseUnits: bigint,
): ZkPruAssetState {
  const now = new Date().toISOString();

  return {
    ...state,
    activeReceivingBalanceBaseUnits:
      state.activeReceivingBalanceBaseUnits + amountBaseUnits,
    receiptCountOnActivePru: state.receiptCountOnActivePru + 1,
    lastReceiptAtOnActivePru: now,
    updatedAt: now,
    version: state.version + 1,
  };
}

/**
 * Records a spend transaction
 */
export function recordSpend(
  state: ZkPruAssetState,
  selectedPruIndices: number[],
  spentAmounts: Map<number, bigint>,
): ZkPruAssetState {
  const now = new Date().toISOString();
  const updated = { ...state };

  let totalSpent = 0n;

  for (const [pruIndex, spent] of spentAmounts.entries()) {
    if (pruIndex === state.activeReceivingPruIndex) {
      updated.activeReceivingBalanceBaseUnits =
        state.activeReceivingBalanceBaseUnits - spent;
    }

    // Track funded PRU removal
    if (spent >= (state.fundedPruIndices.has(pruIndex) ? 1n : 0n)) {
      // If PRU is being spent down, it may need state update
    }

    totalSpent += spent;
  }

  updated.spendNonce = state.spendNonce + 1;
  updated.lastSpendAt = now;
  updated.lastSelectedPruIndex = selectedPruIndices[0];
  updated.updatedAt = now;
  updated.version = state.version + 1;

  return updated;
}

/**
 * Replenishes empty reserve if needed
 */
export function replenishEmptyReserve(
  state: ZkPruAssetState,
  newEmptyPruIndices: number[],
): ZkPruAssetState {
  const updated: typeof state = { ...state };
  updated.emptyReservePruIndices = [
    ...new Set([...state.emptyReservePruIndices, ...newEmptyPruIndices]),
  ];
  updated.updatedAt = new Date().toISOString();
  updated.version = state.version + 1;

  return updated;
}

/**
 * Consumes an empty PRU from reserve.
 * Returns the consumed PRU index or null if reserve is empty.
 */
export function consumeEmptyReservePru(
  state: ZkPruAssetState,
): { state: ZkPruAssetState; consumedPruIndex: number | null } {
  if (state.emptyReservePruIndices.length === 0) {
    return { state, consumedPruIndex: null };
  }

  const [consumed, ...remaining] = state.emptyReservePruIndices;
  return {
    state: {
      ...state,
      emptyReservePruIndices: remaining,
      updatedAt: new Date().toISOString(),
      version: state.version + 1,
    },
    consumedPruIndex: consumed,
  };
}

/**
 * Marks a PRU as retired
 */
export function retirePru(
  state: ZkPruAssetState,
  pruIndex: number,
): ZkPruAssetState {
  const newRetired = new Set(state.retiredPruIndices);
  const newFunded = new Set(state.fundedPruIndices);
  const newSealed = new Set(state.sealedPruIndices);
  newRetired.add(pruIndex);
  newFunded.delete(pruIndex);
  newSealed.delete(pruIndex);
  return {
    ...state,
    retiredPruIndices: newRetired,
    fundedPruIndices: newFunded,
    sealedPruIndices: newSealed,
    updatedAt: new Date().toISOString(),
    version: state.version + 1,
  };
}

/**
 * Gets summary of PRU allocation
 */
export function getPruAllocationSummary(state: ZkPruAssetState): {
  activeReceivingPruIndex: number;
  activeReceivingBalance: bigint;
  fundedCount: number;
  sealedCount: number;
  retiredCount: number;
  emptyReserveCount: number;
  needsReserveReplenishment: boolean;
} {
  return {
    activeReceivingPruIndex: state.activeReceivingPruIndex,
    activeReceivingBalance: state.activeReceivingBalanceBaseUnits,
    fundedCount: state.fundedPruIndices.size,
    sealedCount: state.sealedPruIndices.size,
    retiredCount: state.retiredPruIndices.size,
    emptyReserveCount: state.emptyReservePruIndices.length,
    needsReserveReplenishment:
      state.emptyReservePruIndices.length < state.minEmptyReserveCount,
  };
}

/**
 * Serializes state to JSON-compatible format
 */
export function serializeZkPruAssetState(
  state: ZkPruAssetState,
): Record<string, unknown> {
  return {
    ...state,
    activeReceivingBalanceBaseUnits:
      state.activeReceivingBalanceBaseUnits.toString(),
    receivingRotationTargetBaseUnits:
      state.receivingRotationTargetBaseUnits.toString(),
    receivingRotationTargetMinBaseUnits:
      state.receivingRotationTargetMinBaseUnits.toString(),
    receivingRotationTargetMaxBaseUnits:
      state.receivingRotationTargetMaxBaseUnits.toString(),
    fundedPruIndices: Array.from(state.fundedPruIndices),
    sealedPruIndices: Array.from(state.sealedPruIndices),
    retiredPruIndices: Array.from(state.retiredPruIndices),
  };
}

/**
 * Deserializes state from JSON
 */
export function deserializeZkPruAssetState(
  data: Record<string, unknown>,
): ZkPruAssetState {
  return {
    ...data,
    activeReceivingBalanceBaseUnits: BigInt(
      data.activeReceivingBalanceBaseUnits as string,
    ),
    receivingRotationTargetBaseUnits: BigInt(
      data.receivingRotationTargetBaseUnits as string,
    ),
    receivingRotationTargetMinBaseUnits: BigInt(
      data.receivingRotationTargetMinBaseUnits as string,
    ),
    receivingRotationTargetMaxBaseUnits: BigInt(
      data.receivingRotationTargetMaxBaseUnits as string,
    ),
    fundedPruIndices: new Set(data.fundedPruIndices as number[]),
    sealedPruIndices: new Set(data.sealedPruIndices as number[]),
    retiredPruIndices: new Set(data.retiredPruIndices as number[]),
  } as ZkPruAssetState;
}
