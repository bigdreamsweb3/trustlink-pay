import { randomBytes } from "node:crypto";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
export const DEFAULT_PRU_COUNT = 30;
export const DEFAULT_PRU_PRIVACY_LEVEL = 3;
export const PRU_ATA_RENT_SUBSIDY_LIMIT = 3;
const textEncoder = new TextEncoder();
function hashHex(parts) {
    const chunks = parts.map((part) => {
        if (part instanceof Uint8Array)
            return Buffer.from(part).toString("hex");
        return String(part);
    });
    return bytesToHex(sha256(textEncoder.encode(chunks.join("|"))));
}
function assertNonNegativeAmount(amount, label) {
    if (amount < 0n)
        throw new Error(`${label} must be non-negative`);
}
export function pruCountForPrivacyLevel(_level = DEFAULT_PRU_PRIVACY_LEVEL) {
    return DEFAULT_PRU_COUNT;
}
export function derivePruPublicKey(input) {
    if (!Number.isInteger(input.index) || input.index < 0) {
        throw new Error("PRU index must be a non-negative integer");
    }
    return hashHex(["TSN_V2_TOKEN_AGNOSTIC_PRU", input.masterSeed, input.tinId, input.index]);
}
export function derivePruSet(input) {
    const count = pruCountForPrivacyLevel(input.privacyLevel ?? DEFAULT_PRU_PRIVACY_LEVEL);
    return Array.from({ length: count }, (_, index) => ({
        tinId: input.tinId,
        index,
        derivedPublicKey: derivePruPublicKey({ masterSeed: input.masterSeed, tinId: input.tinId, index }),
        encryptedMetadata: input.encryptedMetadataForIndex?.(index),
        state: input.initialState ?? "PLANNED",
    }));
}
export function computePruConfigurationHash(prus) {
    const canonical = [...prus]
        .sort((left, right) => left.index - right.index)
        .map((pru) => `${pru.tinId}:${pru.index}:${pru.derivedPublicKey}:${pru.encryptedMetadata ?? ""}`)
        .join("\n");
    return hashHex(["TSN_V2_TOKEN_AGNOSTIC_PRU_CONFIGURATION", canonical]);
}
export function deterministicAllocationSeed(input) {
    return hashHex(["TSN_V2_ALLOCATION_SEED", input.txId, input.tinId, input.tokenMint]);
}
export function allocatePrusDeterministically(input) {
    const amount = BigInt(input.amount);
    assertNonNegativeAmount(amount, "amount");
    const stateByIndex = new Map((input.lifecycle ?? []).map((record) => [record.pruIndex, record.state]));
    const eligible = input.pruSet
        .filter((pru) => pru.tinId === input.tinId && (stateByIndex.get(pru.index) ?? pru.state) !== "SWEPT")
        .sort((left, right) => left.index - right.index);
    if (eligible.length === 0)
        throw new Error("PRU set must contain at least one non-swept token-agnostic endpoint");
    const seed = deterministicAllocationSeed(input);
    const weights = eligible.map((pru) => BigInt(`0x${hashHex(["TSN_V2_PRU_WEIGHT", seed, pru.derivedPublicKey, pru.index])}`) + 1n);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);
    let assigned = 0n;
    const distribution = eligible.map((pru, position) => {
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
export function planLazyAtaCreation(input) {
    const subsidyLimit = input.subsidyLimit ?? PRU_ATA_RENT_SUBSIDY_LIMIT;
    const lifecycleByKey = new Map(input.lifecycle.map((record) => [`${record.tokenMint ?? ""}:${record.pruIndex}`, record]));
    return input.allocation.map((item) => {
        const record = lifecycleByKey.get(`${item.tokenMint}:${item.pru.index}`);
        if (record?.ataCreated)
            return { ...item, ataAction: "none" };
        const subsidiesUsed = record?.ataRentSubsidiesUsed ?? 0;
        return { ...item, ataAction: subsidiesUsed < subsidyLimit ? "protocol_subsidized" : "activation_fee" };
    });
}
export function computeTinBalance(balances, tokenMint) {
    const totals = balances.filter((entry) => !tokenMint || entry.tokenMint === tokenMint).reduce((sum, entry) => {
        assertNonNegativeAmount(entry.available, "available");
        assertNonNegativeAmount(entry.pending, "pending");
        assertNonNegativeAmount(entry.settled, "settled");
        sum.available += entry.available;
        sum.pending += entry.pending;
        sum.settled += entry.settled;
        return sum;
    }, { available: 0n, pending: 0n, settled: 0n });
    return { ...totals, final: totals.available + totals.settled - totals.pending };
}
export function selectRandomPruForSpend(input) {
    const eligible = input.balances.filter((entry) => entry.tokenMint === input.tokenMint && entry.pru.state !== "SWEPT" && entry.available + entry.settled - entry.pending > 0n);
    if (eligible.length === 0)
        throw new Error("No spendable PRU key available for randomized signing");
    const entropy = Buffer.from((input.randomBytesFn ?? randomBytes)(8));
    const offset = Number(entropy.readBigUInt64LE(0) % BigInt(eligible.length));
    return eligible[offset].pru;
}
export function selectPrusForSpend(input) {
    const amount = BigInt(input.amount);
    assertNonNegativeAmount(amount, "amount");
    const selected = [];
    let remaining = amount;
    const ordered = [...input.balances]
        .filter((entry) => entry.tokenMint === input.tokenMint)
        .sort((left, right) => left.pru.index - right.pru.index);
    const signingIndex = input.signingPru?.index;
    for (const entry of ordered) {
        if (remaining === 0n)
            break;
        if (entry.pru.state === "SWEPT")
            continue;
        const usable = entry.available + entry.settled - entry.pending;
        if (usable <= 0n)
            continue;
        const amountFromPru = usable >= remaining ? remaining : usable;
        selected.push({ pru: { ...entry.pru, state: entry.pru.index === signingIndex ? "USED" : entry.pru.state }, tokenMint: input.tokenMint, amount: amountFromPru });
        remaining -= amountFromPru;
    }
    if (remaining !== 0n)
        throw new Error("Insufficient unified TIN balance for PRU spend selection");
    return selected;
}
export function planPruSweep(balances, tokenMint) {
    return balances
        .filter((entry) => (!tokenMint || entry.tokenMint === tokenMint) && entry.pru.state !== "SWEPT")
        .map((entry) => ({ pru: entry.pru, tokenMint: entry.tokenMint, amount: entry.available + entry.settled - entry.pending }))
        .filter((entry) => entry.amount > 0n);
}
