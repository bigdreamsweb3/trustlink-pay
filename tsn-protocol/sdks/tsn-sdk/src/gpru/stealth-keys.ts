import { sha3_512 } from "@noble/hashes/sha3";
import { ristretto255 } from "@noble/curves/ed25519.js";
import { ElGamalPubkey, ElGamalSecretKey } from "@solana/zk-sdk";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export const GPRU_DNA_ELGAMAL_KEY_VERSION_V1 = 1 as const;
const TWEAK_DOMAIN = new TextEncoder().encode("TSN_GPRU_DNA_ELGAMAL_TWEAK_V1\0");
const COMMITMENT_DOMAIN = new TextEncoder().encode("TSN_GPRU_DNA_ELGAMAL_KEY_COMMITMENT_V1\0");
const SCALAR_ORDER = ristretto255.Point.Fn.ORDER;

export type GpruDnaPublicKeyV1 = {
  version: 1;
  dna: Uint8Array;
  ephemeralPublicKey: Uint8Array;
  oneTimePublicKey: Uint8Array;
  keyCommitment: Uint8Array;
};

export type GpruDnaOwnerKeyV1 = GpruDnaPublicKeyV1 & {
  oneTimeSecretKey: Uint8Array;
};

function assert32(value: Uint8Array, label: string): void {
  if (!(value instanceof Uint8Array) || value.length !== 32) {
    throw new Error(`${label} must be exactly 32 bytes`);
  }
}

function littleEndianInteger(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index]!);
  }
  return value;
}

function littleEndianBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

function mod(value: bigint): bigint {
  const reduced = value % SCALAR_ORDER;
  return reduced < 0n ? reduced + SCALAR_ORDER : reduced;
}

function inverse(value: bigint): bigint {
  const scalar = mod(value);
  if (scalar === 0n) throw new Error("GPRU ElGamal scalar cannot be zero");
  let oldR = SCALAR_ORDER;
  let r = scalar;
  let oldS = 0n;
  let s = 1n;
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }
  if (oldR !== 1n) throw new Error("GPRU ElGamal scalar is not invertible");
  return mod(oldS);
}

function deriveTweak(dna: Uint8Array, sharedPoint: Uint8Array): bigint {
  const digest = sha3_512(new Uint8Array([...TWEAK_DOMAIN, ...dna, ...sharedPoint]));
  const tweak = mod(littleEndianInteger(digest));
  if (tweak === 0n) throw new Error("GPRU derived a zero ElGamal tweak; retry with a fresh DNA");
  return tweak;
}

function deriveCommitment(dna: Uint8Array, ephemeral: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return sha256(new Uint8Array([
    ...COMMITMENT_DOMAIN,
    GPRU_DNA_ELGAMAL_KEY_VERSION_V1,
    ...dna,
    ...ephemeral,
    ...publicKey,
  ]));
}

/**
 * Recover the one-time private key for a DNA using the owner's stable scan
 * secret. The Node creates the ephemeral and one-time public keys; it never
 * receives this secret or the owner's scan secret.
 */
export function deriveOwnerGpruDnaKeyV1(params: {
  dna: Uint8Array;
  ephemeralPublicKey: Uint8Array;
  oneTimePublicKey: Uint8Array;
  scanSecretKey: Uint8Array;
}): GpruDnaOwnerKeyV1 {
  assert32(params.dna, "GPRU DNA");
  assert32(params.ephemeralPublicKey, "GPRU ephemeral public key");
  assert32(params.oneTimePublicKey, "GPRU one-time public key");
  assert32(params.scanSecretKey, "GPRU scan secret key");

  const scanSecret = littleEndianInteger(params.scanSecretKey);
  if (scanSecret === 0n || scanSecret >= SCALAR_ORDER) {
    throw new Error("GPRU scan secret key is not a canonical nonzero Solana ElGamal scalar");
  }
  const ephemeral = ristretto255.Point.fromBytes(params.ephemeralPublicKey);
  const shared = ephemeral.multiply(inverse(scanSecret)).toBytes();
  const tweak = deriveTweak(params.dna, shared);
  const oneTimeSecret = mod(scanSecret * inverse(tweak));
  const secretBytes = littleEndianBytes(oneTimeSecret, 32);

  const secretKey = ElGamalSecretKey.fromBytes(secretBytes);
  const publicKey = ElGamalPubkey.fromSecretKey(secretKey);
  try {
    const derivedPublicKey = publicKey.toBytes();
    if (bytesToHex(derivedPublicKey) !== bytesToHex(params.oneTimePublicKey)) {
      throw new Error("GPRU DNA key does not match the Node-derived one-time public key");
    }
    return {
      version: GPRU_DNA_ELGAMAL_KEY_VERSION_V1,
      dna: new Uint8Array(params.dna),
      ephemeralPublicKey: new Uint8Array(params.ephemeralPublicKey),
      oneTimePublicKey: new Uint8Array(params.oneTimePublicKey),
      keyCommitment: deriveCommitment(params.dna, params.ephemeralPublicKey, params.oneTimePublicKey),
      oneTimeSecretKey: secretBytes,
    };
  } finally {
    publicKey.free();
    secretKey.free();
  }
}
