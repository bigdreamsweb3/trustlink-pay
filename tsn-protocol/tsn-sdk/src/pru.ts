import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import nacl from "tweetnacl";

export type PruLifecycleState = "PLANNED" | "ACTIVE" | "USED" | "SWEPT";
export type TsnBalanceState = "AVAILABLE" | "PENDING" | "SETTLED";

export const DEFAULT_PRU_COUNT = 30 as const;
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
const TSN_DOMAIN_TAG = "TSN_TRUSTLINK_INTENT_V1";
const PRU_CONFIGURATION_TAG = "TSN_V1_TOKEN_AGNOSTIC_PRU_CONFIGURATION";
const PRU_ALLOCATION_SEED_TAG = "TSN_V1_ALLOCATION_SEED";
const PRU_WEIGHT_TAG = "TSN_V1_PRU_WEIGHT";
const PRU_REMAINDER_TAG = "TSN_V1_REMAINDER";
const TIN_MASTER_SEED_BYTES = 32;
const PRU_INTENT_TTL_SECONDS = 60;

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

export function getDefaultPruCount() {
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
  const masterSeedHex = typeof input.masterSeed === "string"
    ? input.masterSeed
    : bytesToHex(input.masterSeed);
  const seed = sha256(textEncoder.encode(`TRUSTLINK_PRU_KEY_V1|${masterSeedHex}|${input.tinId}|${input.index}`));
  const keypair = nacl.sign.keyPair.fromSeed(seed);
  wipeBytes(seed);
  return bytesToHex(keypair.publicKey);
}

export function derivePruSet(input: {
  masterSeed: string | Uint8Array;
  tinId: string;
  encryptedMetadataForIndex?: (index: number) => string | undefined;
  initialState?: PruLifecycleState;
}) {
  const count = getDefaultPruCount();
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
  return hashHex([PRU_CONFIGURATION_TAG, canonical]);
}

export function deterministicAllocationSeed(input: { txId: string; tinId: string; tokenMint: string }) {
  return hashHex([PRU_ALLOCATION_SEED_TAG, input.txId, input.tinId, input.tokenMint]);
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
  const weights = eligible.map((pru) => BigInt(`0x${hashHex([PRU_WEIGHT_TAG, seed, pru.derivedPublicKey, pru.index])}`) + 1n);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);

  let assigned = 0n;
  const distribution = eligible.map((pru, position): PruAllocation => {
    const base = (amount * weights[position]) / weightTotal;
    assigned += base;
    return { pru, tokenMint: input.tokenMint, amount: base, ataAction: "none" };
  });

  let remainder = amount - assigned;
  const remainderOrder = eligible
    .map((pru, position) => ({ position, rank: hashHex([PRU_REMAINDER_TAG, seed, pru.derivedPublicKey, pru.index]) }))
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
  const entropy = Buffer.from((input.randomBytesFn ?? randomBytesCsprng)(8));
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

export type TsnScopedPruIntentMessage = {
  intent_id: string;
  tsn_domain: string;
  tin: string;
  pru_index: number;
  amount: string;
  destination_hash: string;
  expiry: number;
  nonce: number;
};

export type TsnScopedPruIntent = {
  message: TsnScopedPruIntentMessage;
  messageBytes: Uint8Array;
  pruPublicKey: string;
  pruSignature: string;
};

function getBrowserCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!globalThis.crypto || !subtle) {
    throw new Error("WebCrypto is required for TrustLink TIN seed encryption");
  }
  return globalThis.crypto;
}

function randomBytesCsprng(size: number) {
  const bytes = new Uint8Array(size);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  throw new Error("Web Crypto API (crypto.getRandomValues) is required for TrustLink SDK");
}

function canonicalizeIntentMessage(message: TsnScopedPruIntentMessage) {
  return JSON.stringify({
    intent_id: message.intent_id,
    tsn_domain: message.tsn_domain,
    tin: message.tin,
    pru_index: message.pru_index,
    amount: message.amount,
    destination_hash: message.destination_hash,
    expiry: message.expiry,
    nonce: message.nonce,
  });
}

function wipeBytes(bytes?: Uint8Array | null) {
  if (bytes) bytes.fill(0);
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function generateTinMasterSeed(randomBytesFn: (size: number) => Uint8Array = randomBytesCsprng) {
  const seed = randomBytesFn(TIN_MASTER_SEED_BYTES);
  if (seed.length !== TIN_MASTER_SEED_BYTES) throw new Error("TIN Master Seed must be exactly 32 bytes");
  return seed;
}

export async function encryptTinMasterSeed(params: {
  tinMasterSeed: Uint8Array;
  mainWalletSignature: string | Uint8Array;
  pin: string;
}) {
  if (params.tinMasterSeed.length !== TIN_MASTER_SEED_BYTES) throw new Error("TIN Master Seed must be 32 bytes");
  const cryptoImpl = getBrowserCrypto();
  const signatureBytes = typeof params.mainWalletSignature === "string"
    ? textEncoder.encode(params.mainWalletSignature)
    : params.mainWalletSignature;
  const keyMaterial = sha256(new Uint8Array([...signatureBytes, ...textEncoder.encode(params.pin)]));
  const key = await cryptoImpl.subtle.importKey("raw", toArrayBuffer(keyMaterial), "AES-GCM", false, ["encrypt"]);
  const iv = randomBytesCsprng(12);
  const ciphertext = new Uint8Array(await cryptoImpl.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(params.tinMasterSeed)));
  return {
    algorithm: "AES-256-GCM" as const,
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(ciphertext),
  };
}

export async function decryptTinMasterSeed(params: {
  ciphertext: string;
  iv: string;
  mainWalletSignature: string | Uint8Array;
  pin: string;
}) {
  const cryptoImpl = getBrowserCrypto();
  const signatureBytes = typeof params.mainWalletSignature === "string"
    ? textEncoder.encode(params.mainWalletSignature)
    : params.mainWalletSignature;
  const keyMaterial = sha256(new Uint8Array([...signatureBytes, ...textEncoder.encode(params.pin)]));
  const key = await cryptoImpl.subtle.importKey("raw", toArrayBuffer(keyMaterial), "AES-GCM", false, ["decrypt"]);
  return new Uint8Array(await cryptoImpl.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(Buffer.from(params.iv, "hex")) },
    key,
    toArrayBuffer(Buffer.from(params.ciphertext, "hex")),
  ));
}

export function computeTsnDomain(tsnVaultPubkey: string | Uint8Array) {
  const vaultBytes = typeof tsnVaultPubkey === "string" ? textEncoder.encode(tsnVaultPubkey) : tsnVaultPubkey;
  return bytesToHex(sha256(new Uint8Array([...textEncoder.encode(TSN_DOMAIN_TAG), ...vaultBytes])));
}

export function computeDestinationHash(recipientTin: string | number | bigint) {
  return bytesToHex(sha256(textEncoder.encode(String(recipientTin))));
}

export function computePruSpendAuthHash(params: {
  tin: string | number | bigint;
  pruIndex: number;
  mainWalletPubkey: string | Uint8Array;
  domainTag?: string;
}) {
  const walletBytes = typeof params.mainWalletPubkey === "string"
    ? textEncoder.encode(params.mainWalletPubkey)
    : params.mainWalletPubkey;
  return bytesToHex(sha256(new Uint8Array([
    ...textEncoder.encode(String(params.tin)),
    ...new Uint8Array(new Uint16Array([params.pruIndex]).buffer),
    ...walletBytes,
    ...textEncoder.encode(params.domainTag ?? "TRUSTLINK_PRU_SPEND_GUARD_V1"),
  ])));
}

function derivePruKeypair(params: { tinMasterSeed: Uint8Array; tin: string | number | bigint; pruIndex: number }) {
  const seed = sha256(textEncoder.encode(`TRUSTLINK_PRU_KEY_V1|${bytesToHex(params.tinMasterSeed)}|${String(params.tin)}|${params.pruIndex}`));
  const keypair = nacl.sign.keyPair.fromSeed(seed);
  wipeBytes(seed);
  return keypair;
}

export function createScopedPruIntent(params: {
  tinMasterSeed: Uint8Array;
  tsnVaultPubkey: string | Uint8Array;
  tin: string | number | bigint;
  pruIndex: number;
  amount: bigint | number | string;
  recipientTin: string | number | bigint;
  intentId?: string;
  nowUnixSeconds?: number;
  nonce?: number;
}) {
  const keypair = derivePruKeypair({ tinMasterSeed: params.tinMasterSeed, tin: params.tin, pruIndex: params.pruIndex });
  try {
    const message: TsnScopedPruIntentMessage = {
      intent_id: params.intentId ?? bytesToHex(randomBytesCsprng(16)),
      tsn_domain: computeTsnDomain(params.tsnVaultPubkey),
      tin: String(params.tin),
      pru_index: params.pruIndex,
      amount: String(params.amount),
      destination_hash: computeDestinationHash(params.recipientTin),
      expiry: (params.nowUnixSeconds ?? Math.floor(Date.now() / 1000)) + PRU_INTENT_TTL_SECONDS,
      nonce: params.nonce ?? randomBytesCsprng(1)[0],
    };
    const messageBytes = textEncoder.encode(canonicalizeIntentMessage(message));
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
    return {
      message,
      messageBytes,
      pruPublicKey: bytesToHex(keypair.publicKey),
      pruSignature: bytesToHex(signature),
    };
  } finally {
    wipeBytes(keypair.secretKey);
  }
}

export function verifyScopedPruIntent(params: {
  intent: TsnScopedPruIntent;
  expectedTsnVaultPubkey: string | Uint8Array;
  mainWalletVerified: boolean;
  expectedTin: string | number | bigint;
  seenIntentIds?: Set<string>;
  nonceBitmask: Uint8Array;
  nowUnixSeconds?: number;
  pruActive: boolean;
}) {
  const expectedDomain = computeTsnDomain(params.expectedTsnVaultPubkey);
  if (params.intent.message.tsn_domain !== expectedDomain) throw new Error("Invalid TSN domain");
  if (!params.mainWalletVerified) throw new Error("Invalid main wallet spend proof");
  if (params.intent.message.tin !== String(params.expectedTin)) throw new Error("PRU spend guard TIN mismatch");
  if (params.seenIntentIds?.has(params.intent.message.intent_id)) throw new Error("Intent replay rejected");
  const nonce = params.intent.message.nonce;
  if (!Number.isInteger(nonce) || nonce < 0 || nonce > 255) throw new Error("Invalid PRU nonce");
  const byteIndex = Math.floor(nonce / 8);
  const bit = 1 << (nonce % 8);
  if ((params.nonceBitmask[byteIndex] & bit) !== 0) throw new Error("PRU nonce replay rejected");
  if (params.intent.message.expiry <= (params.nowUnixSeconds ?? Math.floor(Date.now() / 1000))) throw new Error("Expired PRU intent");
  if (!params.pruActive) throw new Error("PRU spend guard is inactive");
  return true;
}
