import { sha256 } from "@noble/hashes/sha256";
import { assertGpruMemoActionMatchesProofV1, parseGpruMemoBindingV1, validateGpruBalanceActionRecordV1, type GpruBalanceActionRecordV1 } from "./transaction-record.js";

export type GpruDecryptedMemoActionV1 = {
  memoPayload: string;
  record: GpruBalanceActionRecordV1;
  onChainAction: {
    actionKind: 1 | 2 | 3;
    tokenId: number;
    amountBaseUnits: string;
    actionCommitment: string;
    authorizationCommitment: string;
    nullifier: string;
  };
};

export type RecoveredGpruBalanceHistoryV1 = {
  version: 1;
  latestSequence: string;
  balances: Array<{ tokenId: number; amountBaseUnits: string; blindingScalar: string }>;
  actions: Array<GpruBalanceActionRecordV1 & { memoCommitment: string }>;
};

const BABYJUB_SUBORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
const BN254_SCALAR_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function memoCommitmentField(memoPayload: string): string {
  const digest = sha256(new TextEncoder().encode(memoPayload));
  let value = 0n;
  for (const byte of digest) value = (value << 8n) | BigInt(byte);
  return (value % BN254_SCALAR_MODULUS).toString(16).padStart(64, "0");
}

/** Rebuild owner balances from decrypted Memo actions and validate their private predecessor chain. */
export function recoverGpruBalanceHistoryV1(
  input: readonly GpruDecryptedMemoActionV1[],
  expectedLatestSequence?: string | bigint,
): RecoveredGpruBalanceHistoryV1 {
  if (input.length === 0) throw new Error("No decrypted GPRU balance actions were supplied");
  const actions = input.map(({ memoPayload, record, onChainAction }) => {
    if (typeof memoPayload !== "string") throw new Error("GPRU Memo payload must be text");
    const binding = parseGpruMemoBindingV1(memoPayload);
    const validated = validateGpruBalanceActionRecordV1(record);
    if (validated.actionCommitment !== binding.actionCommitment
        || validated.actionCommitment !== onChainAction.actionCommitment) {
      throw new Error("Decrypted GPRU action commitment differs from the on-chain proof binding");
    }
    assertGpruMemoActionMatchesProofV1(validated, onChainAction);
    const memoCommitment = memoCommitmentField(memoPayload);
    return { memoPayload, record: validated, memoCommitment };
  }).sort((left, right) => {
    const a = BigInt(left.record.sequence);
    const b = BigInt(right.record.sequence);
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const balances = new Map<number, bigint>();
  const blindings = new Map<number, bigint>();
  const normalized: Array<GpruBalanceActionRecordV1 & { memoCommitment: string }> = [];
  let expectedSequence = 1n;
  let expectedPreviousMemo = "0".repeat(64);
  for (const { record, memoCommitment } of actions) {
    const sequence = BigInt(record.sequence);
    if (sequence !== expectedSequence) throw new Error(`GPRU Memo history has a sequence gap at ${expectedSequence}`);
    if (record.previousMemoCommitment !== expectedPreviousMemo) {
      throw new Error(`GPRU Memo ${sequence} does not link to its decrypted predecessor`);
    }
    const prior = balances.get(record.tokenId) ?? 0n;
    const amount = BigInt(record.amountBaseUnits);
    const next = record.actionKind === 1 ? prior + amount : prior - amount;
    if (next < 0n) throw new Error(`GPRU decrypted history produces a negative balance for token ${record.tokenId}`);
    balances.set(record.tokenId, next);
    blindings.set(record.tokenId, ((blindings.get(record.tokenId) ?? 0n) + BigInt(record.balanceBlindingDelta)) % BABYJUB_SUBORDER);
    normalized.push({ ...record, memoCommitment });
    expectedSequence += 1n;
    expectedPreviousMemo = memoCommitment;
  }

  const latestSequence = (expectedSequence - 1n).toString();
  if (expectedLatestSequence !== undefined && latestSequence !== BigInt(expectedLatestSequence).toString()) {
    throw new Error(`GPRU Memo history ends at ${latestSequence}; expected ${expectedLatestSequence}`);
  }
  return {
    version: 1,
    latestSequence,
    balances: [...balances.entries()].sort(([a], [b]) => a - b).map(([tokenId, amount]) => ({
      tokenId,
      amountBaseUnits: amount.toString(),
      blindingScalar: (blindings.get(tokenId) ?? 0n).toString(),
    })),
    actions: normalized,
  };
}
