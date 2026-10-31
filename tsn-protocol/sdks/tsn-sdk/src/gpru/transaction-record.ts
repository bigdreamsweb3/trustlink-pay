import { decrypt, type EncryptedData } from "@dbrix/core";
import { decodeLedgerSlots } from "@dbrix/ledger";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { ristretto255 } from "@noble/curves/ed25519.js";
import { ConfidentialKeys, ElGamalPubkey } from "@solana/zk-sdk";

const RECORD_KEY_DOMAIN = new TextEncoder().encode("DBRIX_GPRU_TRANSACTION_RECORD_KEY_V1\0");
const RECORD_ENVELOPE_ALGORITHM = "dbrix-core-secretbox-v1";
const SCALAR_ORDER = ristretto255.Point.Fn.ORDER;

export type GpruTransactionRecordEnvelopeV1 = {
  version: 1;
  algorithm: typeof RECORD_ENVELOPE_ALGORITHM;
  dna: string;
  recordEphemeralPublicKey: string;
  data: string;
  nonce: string;
  compression?: "deflate";
};

export type GpruBalanceActionRecordV1 = {
  version: 1;
  recordType: "tsn-gpru-balance-action-v1";
  sequence: string;
  previousMemoCommitment: string;
  actionCommitment: string;
  authorizationCommitment: string;
  nullifier: string;
  actionKind: 1 | 2 | 3;
  tokenId: number;
  amountBaseUnits: string;
  balanceBlindingDelta: string;
};

export type GpruMemoBindingV1 = {
  successorPortfolioRoot: string;
  successorBalancePoint: { x: string; y: string };
  actionCommitment: string;
};

const MEMO_BINDING_PREFIX = /^TSN_GPRU_HEAD_V1:([0-9a-f]{64}):([0-9a-f]{64}):([0-9a-f]{64}):([0-9a-f]{64}):/iu;

function assert32(value: Uint8Array, label: string): void {
  if (!(value instanceof Uint8Array) || value.length !== 32) {
    throw new Error(`${label} must be exactly 32 bytes`);
  }
}

function littleEndianInteger(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    result = (result << 8n) | BigInt(bytes[index]!);
  }
  return result;
}

function inverse(value: bigint): bigint {
  const scalar = value % SCALAR_ORDER;
  if (scalar === 0n) throw new Error("GPRU scan secret cannot be zero");
  let oldR = SCALAR_ORDER;
  let r = scalar;
  let oldS = 0n;
  let s = 1n;
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }
  if (oldR !== 1n) throw new Error("GPRU scan secret is not invertible");
  return (oldS % SCALAR_ORDER + SCALAR_ORDER) % SCALAR_ORDER;
}

/** Derives the DBrix Secretbox key using the owner's GPRU route key and Node's fresh public ephemeral key. */
export function deriveGpruTransactionRecordKeyV1(params: {
  masterSeed: Uint8Array;
  gpruElgamalPublicKey: Uint8Array;
  dna: Uint8Array;
  recordEphemeralPublicKey: Uint8Array;
}): Uint8Array {
  assert32(params.gpruElgamalPublicKey, "GPRU ElGamal public key");
  assert32(params.dna, "GPRU DNA");
  assert32(params.recordEphemeralPublicKey, "GPRU record ephemeral public key");
  if (!(params.masterSeed instanceof Uint8Array) || params.masterSeed.length < 32) {
    throw new Error("TIN master seed must contain at least 32 bytes");
  }

  const keys = ConfidentialKeys.fromIkm(params.masterSeed);
  const keypair = keys.elgamal();
  const secretKey = keypair.secret();
  const publicKey = ElGamalPubkey.fromSecretKey(secretKey);
  try {
    const actualPublicKey = publicKey.toBytes();
    if (actualPublicKey.length !== 32 || bytesToHex(actualPublicKey) !== bytesToHex(params.gpruElgamalPublicKey)) {
      throw new Error("TIN master seed does not derive the registered GPRU ElGamal route key");
    }
    const ephemeral = ristretto255.Point.fromBytes(params.recordEphemeralPublicKey);
    const scanSecret = littleEndianInteger(secretKey.toBytes());
    const sharedPoint = ephemeral.multiply(inverse(scanSecret)).toBytes();
    return sha256(new Uint8Array([
      ...RECORD_KEY_DOMAIN,
      ...sharedPoint,
      ...params.dna,
      ...params.recordEphemeralPublicKey,
    ]));
  } finally {
    publicKey.free();
    secretKey.free();
    keypair.free();
    keys.free();
  }
}

/** Decodes the Base64URL Memo emitted from DBrix Ledger slots and decrypts the owner-only record. */
export function parseGpruMemoBindingV1(memoPayload: string): GpruMemoBindingV1 {
  const match = MEMO_BINDING_PREFIX.exec(memoPayload);
  if (!match) throw new Error("Memo does not contain the GPRU portfolio-head V1 binding");
  return {
    successorPortfolioRoot: match[1]!.toLowerCase(),
    successorBalancePoint: { x: match[2]!.toLowerCase(), y: match[3]!.toLowerCase() },
    actionCommitment: match[4]!.toLowerCase(),
  };
}

export function validateGpruBalanceActionRecordV1(value: unknown): GpruBalanceActionRecordV1 {
  if (!value || typeof value !== "object") throw new Error("GPRU owner balance action record must be an object");
  const record = value as Partial<GpruBalanceActionRecordV1>;
  const expectedKeys = ["version", "recordType", "sequence", "previousMemoCommitment", "actionCommitment", "authorizationCommitment", "nullifier", "actionKind", "tokenId", "amountBaseUnits", "balanceBlindingDelta"];
  if (Object.keys(value).sort().join("|") !== expectedKeys.sort().join("|")) {
    throw new Error("GPRU owner action record contains missing or unsupported fields");
  }
  if (record.version !== 1 || record.recordType !== "tsn-gpru-balance-action-v1") {
    throw new Error("Unsupported GPRU owner balance action record");
  }
  if (!/^[1-9][0-9]*$/u.test(String(record.sequence))) throw new Error("GPRU action sequence must be a positive decimal integer");
  if (!/^[0-9a-f]{64}$/u.test(String(record.previousMemoCommitment))) throw new Error("GPRU predecessor Memo commitment must be 32-byte lowercase hex");
  if (!/^[0-9a-f]{64}$/u.test(String(record.actionCommitment))) throw new Error("GPRU action commitment must be 32-byte lowercase hex");
  if (!/^[0-9a-f]{64}$/u.test(String(record.authorizationCommitment))) throw new Error("GPRU authorization commitment must be 32-byte lowercase hex");
  if (!/^[0-9a-f]{64}$/u.test(String(record.nullifier))) throw new Error("GPRU nullifier must be 32-byte lowercase hex");
  const bn254ScalarModulus = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  if (BigInt(`0x${record.previousMemoCommitment}`) >= bn254ScalarModulus
      || BigInt(`0x${record.actionCommitment}`) === 0n
      || BigInt(`0x${record.actionCommitment}`) >= bn254ScalarModulus
      || BigInt(`0x${record.authorizationCommitment}`) >= bn254ScalarModulus
      || BigInt(`0x${record.nullifier}`) >= bn254ScalarModulus) {
    throw new Error("GPRU Memo, action, authorization, and nullifier values must be canonical BN254 field elements");
  }
  if (![1, 2, 3].includes(Number(record.actionKind))) throw new Error("GPRU action kind must be credit (1), debit (2), or exit (3)");
  if (!Number.isInteger(record.tokenId) || Number(record.tokenId) <= 0 || Number(record.tokenId) > 0xffff_ffff) {
    throw new Error("GPRU action tokenId must be a positive u32");
  }
  if (!/^[1-9][0-9]*$/u.test(String(record.amountBaseUnits))) throw new Error("GPRU action amount must be a positive decimal integer");
  if (!/^(0|[1-9][0-9]*)$/u.test(String(record.balanceBlindingDelta))) throw new Error("GPRU blinding delta must be a nonnegative decimal integer");
  const sequence = BigInt(record.sequence!);
  if (sequence > 0xffff_ffff_ffff_ffffn || BigInt(record.amountBaseUnits!) > 0xffff_ffff_ffff_ffffn) {
    throw new Error("GPRU action sequence or amount exceeds u64");
  }
  const blind = BigInt(record.balanceBlindingDelta!);
  const babyJubjubSuborder = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
  if (blind === 0n || blind >= babyJubjubSuborder) throw new Error("GPRU blinding delta must be nonzero and inside the BabyJubjub scalar field");
  const predecessor = record.previousMemoCommitment!.toLowerCase();
  if ((sequence === 1n) !== (predecessor === "0".repeat(64))) {
    throw new Error("First GPRU action must have no predecessor; later actions must name one");
  }
  return {
    version: 1,
    recordType: "tsn-gpru-balance-action-v1",
    sequence: sequence.toString(),
    previousMemoCommitment: predecessor,
    actionCommitment: record.actionCommitment!.toLowerCase(),
    authorizationCommitment: record.authorizationCommitment!.toLowerCase(),
    nullifier: record.nullifier!.toLowerCase(),
    actionKind: Number(record.actionKind) as 1 | 2 | 3,
    tokenId: Number(record.tokenId),
    amountBaseUnits: BigInt(record.amountBaseUnits!).toString(),
    balanceBlindingDelta: blind.toString(),
  };
}

/** Check the decrypted Memo record against the action values authenticated by the on-chain Groth16 statement. */
export function assertGpruMemoActionMatchesProofV1(
  record: GpruBalanceActionRecordV1,
  proofAction: {
    actionKind: 1 | 2 | 3;
    tokenId: number;
    amountBaseUnits: string;
    actionCommitment: string;
    authorizationCommitment: string;
    nullifier: string;
  },
): void {
  const validated = validateGpruBalanceActionRecordV1(record);
  if (validated.actionKind !== proofAction.actionKind
      || validated.tokenId !== proofAction.tokenId
      || validated.amountBaseUnits !== BigInt(proofAction.amountBaseUnits).toString()
      || validated.actionCommitment !== proofAction.actionCommitment.toLowerCase()
      || validated.authorizationCommitment !== proofAction.authorizationCommitment.toLowerCase()
      || validated.nullifier !== proofAction.nullifier.toLowerCase()) {
    throw new Error("Decrypted GPRU Memo action does not match the on-chain proof statement");
  }
}

export function decryptGpruLedgerMemoV1(params: {
  memoPayload: string;
  masterSeed: Uint8Array;
  gpruElgamalPublicKey: Uint8Array;
}): GpruBalanceActionRecordV1 {
  parseGpruMemoBindingV1(params.memoPayload);
  const match = MEMO_BINDING_PREFIX.exec(params.memoPayload)!;
  const ledgerPayload = params.memoPayload.slice(match[0].length);
  if (!/^[A-Za-z0-9_-]+$/u.test(ledgerPayload)) {
    throw new Error("GPRU Memo payload must be an unpadded Base64URL Ledger stream");
  }
  const slots: string[] = [];
  for (let offset = 0; offset < ledgerPayload.length; offset += 32) {
    slots.push(ledgerPayload.slice(offset, offset + 32).padEnd(32, "="));
  }
  const documentBytes = decodeLedgerSlots(slots);
  let envelope: GpruTransactionRecordEnvelopeV1;
  try {
    envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(documentBytes));
  } catch {
    throw new Error("Memo does not contain a valid DBrix GPRU record envelope");
  }
  if (envelope.version !== 1 || envelope.algorithm !== RECORD_ENVELOPE_ALGORITHM) {
    throw new Error("Unsupported DBrix GPRU transaction-record envelope version");
  }
  const dna = hexToBytes(envelope.dna);
  const recordEphemeralPublicKey = hexToBytes(envelope.recordEphemeralPublicKey);
  const key = deriveGpruTransactionRecordKeyV1({
    masterSeed: params.masterSeed,
    gpruElgamalPublicKey: params.gpruElgamalPublicKey,
    dna,
    recordEphemeralPublicKey,
  });
  try {
    const record = decrypt<unknown>(
      { data: envelope.data, nonce: envelope.nonce, ...(envelope.compression ? { compression: envelope.compression } : {}) } satisfies EncryptedData,
      key,
    );
    const validated = validateGpruBalanceActionRecordV1(record);
    const binding = parseGpruMemoBindingV1(params.memoPayload);
    if (validated.actionCommitment !== binding.actionCommitment) {
      throw new Error("Decrypted GPRU action commitment differs from the proof-bound Memo prefix");
    }
    return validated;
  } finally {
    key.fill(0);
  }
}

