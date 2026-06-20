import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export type TsnPrivacyLevel = 1 | 2 | 3 | 4;
export type PruLifecycleState = "PLANNED" | "ACTIVE" | "USED" | "SWEPT";
export type TsnBalanceState = "AVAILABLE" | "PENDING" | "SETTLED";

export type PruEndpoint = {
  tinId: string;
  tokenMint: string;
  index: number;
  derivedPublicKey: string;
  encryptedMetadata?: string;
  state: PruLifecycleState;
};

export type PruBalance = {
  pru: PruEndpoint;
  available: bigint;
  pending: bigint;
  settled: bigint;
};

export type PruAllocation = {
  pru: PruEndpoint;
  amount: bigint;
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

export function pruCountForPrivacyLevel(level: TsnPrivacyLevel) {
  switch (level) {
    case 1:
      return 3;
    case 2:
      return 10;
    case 3:
      return 30;
    case 4:
      return 100;
    default:
      throw new Error(`Unsupported TSN privacy level: ${level satisfies never}`);
  }
}

export function derivePruPublicKey(input: {
  masterSeed: string | Uint8Array;
  tinId: string;
  tokenMint: string;
  index: number;
}) {
  if (!Number.isInteger(input.index) || input.index < 0) {
    throw new Error("PRU index must be a non-negative integer");
  }
  return hashHex(["TSN_V1_PRU", input.masterSeed, input.tinId, input.tokenMint, input.index]);
}

export function derivePruSet(input: {
  masterSeed: string | Uint8Array;
  tinId: string;
  tokenMint: string;
  privacyLevel: TsnPrivacyLevel;
  encryptedMetadataForIndex?: (index: number) => string | undefined;
  initialState?: PruLifecycleState;
}) {
  const count = pruCountForPrivacyLevel(input.privacyLevel);
  return Array.from({ length: count }, (_, index): PruEndpoint => ({
    tinId: input.tinId,
    tokenMint: input.tokenMint,
    index,
    derivedPublicKey: derivePruPublicKey({
      masterSeed: input.masterSeed,
      tinId: input.tinId,
      tokenMint: input.tokenMint,
      index,
    }),
    encryptedMetadata: input.encryptedMetadataForIndex?.(index),
    state: input.initialState ?? "PLANNED",
  }));
}

export function computePruConfigurationHash(prus: PruEndpoint[]) {
  const canonical = [...prus]
    .sort((left, right) => left.tokenMint.localeCompare(right.tokenMint) || left.index - right.index)
    .map((pru) => `${pru.tinId}:${pru.tokenMint}:${pru.index}:${pru.derivedPublicKey}:${pru.encryptedMetadata ?? ""}`)
    .join("\n");
  return hashHex(["TSN_V1_PRU_CONFIGURATION", canonical]);
}

export function deterministicAllocationSeed(input: { txId: string; tinId: string; tokenMint: string }) {
  return hashHex(["TSN_V1_ALLOCATION_SEED", input.txId, input.tinId, input.tokenMint]);
}

export function allocatePrusDeterministically(input: {
  txId: string;
  tinId: string;
  tokenMint: string;
  pruSet: PruEndpoint[];
  amount: bigint | number | string;
}) {
  const amount = BigInt(input.amount);
  assertNonNegativeAmount(amount, "amount");
  const eligible = input.pruSet
    .filter((pru) => pru.tinId === input.tinId && pru.tokenMint === input.tokenMint && pru.state !== "SWEPT")
    .sort((left, right) => left.index - right.index);
  if (eligible.length === 0) throw new Error("PRU set must contain at least one non-swept token-bound endpoint");

  const seed = deterministicAllocationSeed(input);
  const weights = eligible.map((pru) => {
    const digest = hashHex(["TSN_V1_PRU_WEIGHT", seed, pru.derivedPublicKey, pru.index]);
    return BigInt(`0x${digest}`) + 1n;
  });
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);

  let assigned = 0n;
  const distribution = eligible.map((pru, position): PruAllocation => {
    const base = (amount * weights[position]) / weightTotal;
    assigned += base;
    return { pru, amount: base };
  });

  let remainder = amount - assigned;
  const remainderOrder = eligible
    .map((pru, position) => ({ position, rank: hashHex(["TSN_V1_REMAINDER", seed, pru.derivedPublicKey, pru.index]) }))
    .sort((left, right) => left.rank.localeCompare(right.rank));
  for (let i = 0; remainder > 0n; i += 1) {
    distribution[remainderOrder[i % remainderOrder.length].position].amount += 1n;
    remainder -= 1n;
  }

  return distribution.sort((left, right) => left.pru.index - right.pru.index);
}

export function computeTinBalance(balances: PruBalance[]): TsnTinBalance {
  const totals = balances.reduce(
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

export function selectPrusForSpend(input: { balances: PruBalance[]; amount: bigint | number | string }) {
  const amount = BigInt(input.amount);
  assertNonNegativeAmount(amount, "amount");
  const selected: PruAllocation[] = [];
  let remaining = amount;
  for (const entry of [...input.balances].sort((left, right) => left.pru.index - right.pru.index)) {
    if (remaining === 0n) break;
    if (entry.pru.state === "SWEPT") continue;
    const usable = entry.available + entry.settled - entry.pending;
    if (usable <= 0n) continue;
    const amountFromPru = usable >= remaining ? remaining : usable;
    selected.push({ pru: entry.pru, amount: amountFromPru });
    remaining -= amountFromPru;
  }
  if (remaining !== 0n) throw new Error("Insufficient unified TIN balance for deterministic PRU spend selection");
  return selected;
}

export function planPruSweep(balances: PruBalance[]) {
  return balances
    .filter((entry) => entry.pru.state !== "SWEPT")
    .map((entry) => ({ pru: entry.pru, amount: entry.available + entry.settled - entry.pending }))
    .filter((entry) => entry.amount > 0n);
}
