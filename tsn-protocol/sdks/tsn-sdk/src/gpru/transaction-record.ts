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
export function decryptGpruLedgerMemoV1<T = Record<string, unknown>>(params: {
  memoPayload: string;
  masterSeed: Uint8Array;
  gpruElgamalPublicKey: Uint8Array;
}): T {
  const prefix = /^TSN_GPRU_HEAD_V1:([0-9a-f]{64}):([0-9a-f]{64}):/iu;
  const match = prefix.exec(params.memoPayload);
  if (!match) throw new Error("Memo does not contain the GPRU hidden-head V1 binding");
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
    return decrypt<T>(
      { data: envelope.data, nonce: envelope.nonce, ...(envelope.compression ? { compression: envelope.compression } : {}) } satisfies EncryptedData,
      key,
    );
  } finally {
    key.fill(0);
  }
}
