import { randomBytes } from "node:crypto";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export type TsnPrivacyLevel = 1 | 2 | 3 | 4;
export type PruLifecycleState = "PLANNED" | "ACTIVE" | "USED" | "SWEPT";
export type TsnBalanceState = "AVAILABLE" | "PENDING" | "SETTLED";

export const DEFAULT_PRU_COUNT = 30 as const;
export const DEFAULT_PRU_PRIVACY_LEVEL = 3 as const;
export const PRU_ATA_RENT_SUBSIDY_LIMIT = 3 as const;

export type PruEndpoint = {
  tinId: string;
  index: number;
  derivedPublicKey: string;
  encryptedMetadata?: string;
  state: PruLifecycleState;
};

export type PruLifecycleRecord = {
  tinId: string;
  tokenMint?: string | null;
  pruIndex: number;
  state: PruLifecycleState;
  ataCreated: boolean;
  ataRentSubsidiesUsed: number;
  lastReceiptTxId?: string | null;
  lastSpendTxId?: string | null;
  updatedAt: string;
};

export type PruBalance = {
  pru: PruEndpoint;
  tokenMint: string;
  available: bigint;
  pending: bigint;
  settled: bigint;
};

export type PruAllocation = {
  pru: PruEndpoint;
  tokenMint: string;
  amount: bigint;
  ataAction?: "none" | "protocol_subsidized" | "activation_fee";
};

export type TsnTinBalance = {
  available: bigint;
  pending: bigint;
  settled: bigint;
  final: bigint;
};

const textEncoder = new TextEncoder();

function hashHex(parts: Array<string | number | bigint | Uint8Array>) {
  const chunks = parts.map((part) => {
    if (part instanceof Uint8Array) return Buffer.from(part).toString("hex");
    return String(part);
  });
  return bytesToHex(sha256(textEncoder.encode(chunks.join("|"))));
}

function assertNonNegativeAmount(amount: bigint, label: string) {
  if (amount < 0n) throw new Error(`${label} must be non-negative`);
}

export function pruCountForPrivacyLevel(_level: TsnPrivacyLevel = DEFAULT_PRU_PRIVACY_LEVEL) {
  return DEFAULT_PRU_COUNT;
}

export function derivePruPublicKey(input: {
  masterSeed: string | Uint8Array;
  tinId: string;
  index: number;
}) {
  if (!Number.isInteger(input.index) || input.index < 0) {
    throw new Error("PRU index must be a non-negative integer");
  }
  return hashHex(["TSN_V2_TOKEN_AGNOSTIC_PRU", input.masterSeed, input.tinId, input.index]);
}

export function derivePruSet(input: {
  masterSeed: string | Uint8Array;
  tinId: string;
  privacyLevel?: TsnPrivacyLevel;
  encryptedMetadataForIndex?: (index: number) => string | undefined;
  initialState?: PruLifecycleState;
}) {
  const count = pruCountForPrivacyLevel(input.privacyLevel ?? DEFAULT_PRU_PRIVACY_LEVEL);
  return Array.from({ length: count }, (_, index): PruEndpoint => ({
    tinId: input.tinId,
    index,
    derivedPublicKey: derivePruPublicKey({ masterSeed: input.masterSeed, tinId: input.tinId, index }),
    encryptedMetadata: input.encryptedMetadataForIndex?.(index),
    state: input.initialState ?? "PLANNED",
  }));
}

export function computePruConfigurationHash(prus: PruEndpoint[]) {
  const canonical = [...prus]
    .sort((left, right) => left.index - right.index)
    .map((pru) => `${pru.tinId}:${pru.index}:${pru.derivedPublicKey}:${pru.encryptedMetadata ?? ""}`)
    .join("\n");
  return hashHex(["TSN_V2_TOKEN_AGNOSTIC_PRU_CONFIGURATION", canonical]);
}

export function deterministicAllocationSeed(input: { txId: string; tinId: string; tokenMint: string }) {
  return hashHex(["TSN_V2_ALLOCATION_SEED", input.txId, input.tinId, input.tokenMint]);
}

export function allocatePrusDeterministically(input: {
  txId: string;
  tinId: string;
  tokenMint: string;
  pruSet: PruEndpoint[];
  amount: bigint | number | string;
  lifecycle?: PruLifecycleRecord[];
}) {
  const amount = BigInt(input.amount);
  assertNonNegativeAmount(amount, "amount");
  const stateByIndex = new Map((input.lifecycle ?? []).map((record) => [record.pruIndex, record.state]));
  const eligible = input.pruSet
    .filter((pru) => pru.tinId === input.tinId && (stateByIndex.get(pru.index) ?? pru.state) !== "SWEPT")
    .sort((left, right) => left.index - right.index);
  if (eligible.length === 0) throw new Error("PRU set must contain at least one non-swept token-agnostic endpoint");

  const seed = deterministicAllocationSeed(input);
  const weights = eligible.map((pru) => BigInt(`0x${hashHex(["TSN_V2_PRU_WEIGHT", seed, pru.derivedPublicKey, pru.index])}`) + 1n);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);

  let assigned = 0n;
  const distribution = eligible.map((pru, position): PruAllocation => {
    const base = (amount * weights[position]) / weightTotal;
    assigned += base;
    return { pru, tokenMint: input.tokenMint, amount: base, ataAction: "none" };
  });

  let remainder = amount - assigned;
  const remainderOrder = eligible
    .map((pru, position) => ({ position, rank: hashHex(["TSN_V2_REMAINDER", seed, pru.derivedPublicKey, pru.index]) }))
    .sort((left, right) => left.rank.localeCompare(right.rank));
  for (let i = 0; remainder > 0n; i += 1) {
    distribution[remainderOrder[i % remainderOrder.length].position].amount += 1n;
    remainder -= 1n;
  }

  return distribution.sort((left, right) => left.pru.index - right.pru.index);
}

export function planLazyAtaCreation(input: { allocation: PruAllocation[]; lifecycle: PruLifecycleRecord[]; subsidyLimit?: number }) {
  const subsidyLimit = input.subsidyLimit ?? PRU_ATA_RENT_SUBSIDY_LIMIT;
  const lifecycleByKey = new Map(input.lifecycle.map((record) => [`${record.tokenMint ?? ""}:${record.pruIndex}`, record]));
  return input.allocation.map((item) => {
    const record = lifecycleByKey.get(`${item.tokenMint}:${item.pru.index}`);
    if (record?.ataCreated) return { ...item, ataAction: "none" as const };
    const subsidiesUsed = record?.ataRentSubsidiesUsed ?? 0;
    return { ...item, ataAction: subsidiesUsed < subsidyLimit ? "protocol_subsidized" as const : "activation_fee" as const };
  });
}

export function computeTinBalance(balances: PruBalance[], tokenMint?: string): TsnTinBalance {
  const totals = balances.filter((entry) => !tokenMint || entry.tokenMint === tokenMint).reduce(
    (sum, entry) => {
      assertNonNegativeAmount(entry.available, "available");
      assertNonNegativeAmount(entry.pending, "pending");
      assertNonNegativeAmount(entry.settled, "settled");
      sum.available += entry.available;
      sum.pending += entry.pending;
      sum.settled += entry.settled;
      return sum;
    },
    { available: 0n, pending: 0n, settled: 0n },
  );
  return { ...totals, final: totals.available + totals.settled - totals.pending };
}

export function selectRandomPruForSpend(input: { balances: PruBalance[]; tokenMint: string; randomBytesFn?: (size: number) => Uint8Array }) {
  const eligible = input.balances.filter((entry) => entry.tokenMint === input.tokenMint && entry.pru.state !== "SWEPT" && entry.available + entry.settled - entry.pending > 0n);
  if (eligible.length === 0) throw new Error("No spendable PRU key available for randomized signing");
  const entropy = Buffer.from((input.randomBytesFn ?? randomBytes)(8));
  const offset = Number(entropy.readBigUInt64LE(0) % BigInt(eligible.length));
  return eligible[offset].pru;
}

export function selectPrusForSpend(input: { balances: PruBalance[]; tokenMint: string; amount: bigint | number | string; signingPru?: PruEndpoint }) {
  const amount = BigInt(input.amount);
  assertNonNegativeAmount(amount, "amount");
  const selected: PruAllocation[] = [];
  let remaining = amount;
  const ordered = [...input.balances]
    .filter((entry) => entry.tokenMint === input.tokenMint)
    .sort((left, right) => left.pru.index - right.pru.index);
  const signingIndex = input.signingPru?.index;
  for (const entry of ordered) {
    if (remaining === 0n) break;
    if (entry.pru.state === "SWEPT") continue;
    const usable = entry.available + entry.settled - entry.pending;
    if (usable <= 0n) continue;
    const amountFromPru = usable >= remaining ? remaining : usable;
    selected.push({ pru: { ...entry.pru, state: entry.pru.index === signingIndex ? "USED" : entry.pru.state }, tokenMint: input.tokenMint, amount: amountFromPru });
    remaining -= amountFromPru;
  }
  if (remaining !== 0n) throw new Error("Insufficient unified TIN balance for PRU spend selection");
  return selected;
}

export function planPruSweep(balances: PruBalance[], tokenMint?: string) {
  return balances
    .filter((entry) => (!tokenMint || entry.tokenMint === tokenMint) && entry.pru.state !== "SWEPT")
    .map((entry) => ({ pru: entry.pru, tokenMint: entry.tokenMint, amount: entry.available + entry.settled - entry.pending }))
    .filter((entry) => entry.amount > 0n);
}
