import { sha256 } from "@noble/hashes/sha256";

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const ORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
const A = 168700n;
const D = 168696n;
const BASE = {
  x: 5299619240641551281634865583518297030282874472190772894086521144482721001553n,
  y: 16950150798460657717958625567821834550301663161624707787222815936182638968203n,
};
const KEY_DOMAIN = new TextEncoder().encode("TSN_GPRU_BALANCE_SCAN_KEY_V1\0");

export type BabyJubPointV1 = { x: bigint; y: bigint };

function mod(value: bigint, modulus = FIELD): bigint {
  const result = value % modulus;
  return result < 0n ? result + modulus : result;
}

function pow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let x = mod(base, modulus);
  let n = exponent;
  let result = 1n;
  while (n > 0n) {
    if (n & 1n) result = (result * x) % modulus;
    x = (x * x) % modulus;
    n >>= 1n;
  }
  return result;
}

function add(p: BabyJubPointV1, q: BabyJubPointV1): BabyJubPointV1 {
  const product = mod(p.x * q.x * p.y * q.y);
  const x = mod((p.x * q.y + p.y * q.x) * pow(1n + D * product, FIELD - 2n, FIELD));
  const y = mod((p.y * q.y - A * p.x * q.x) * pow(1n - D * product, FIELD - 2n, FIELD));
  return { x, y };
}

function multiply(point: BabyJubPointV1, scalar: bigint): BabyJubPointV1 {
  let n = scalar;
  let base = point;
  let result: BabyJubPointV1 = { x: 0n, y: 1n };
  while (n > 0n) {
    if (n & 1n) result = add(result, base);
    base = add(base, base);
    n >>= 1n;
  }
  return result;
}

function assertPoint(point: BabyJubPointV1, label: string): void {
  if (point.x < 0n || point.x >= FIELD || point.y < 0n || point.y >= FIELD
      || mod(A * point.x * point.x + point.y * point.y - 1n - D * point.x * point.x * point.y * point.y) !== 0n) {
    throw new Error(`${label} is not a canonical BabyJubjub point`);
  }
}

export function isValidBabyJubPointV1(point: BabyJubPointV1): boolean {
  try {
    assertPoint(point, "BabyJubjub point");
    if (point.x === 0n && point.y === 1n) return false;
    const subgroupCheck = multiply(point, ORDER);
    return subgroupCheck.x === 0n && subgroupCheck.y === 1n;
  } catch {
    return false;
  }
}

function scalarFromBytes(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i -= 1) value = (value << 8n) | BigInt(bytes[i]!);
  return value;
}

function to32BE(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let n = value;
  for (let i = 31; i >= 0; i -= 1) {
    out[i] = Number(n & 255n);
    n >>= 8n;
  }
  return out;
}

/** Derive the private scan scalar and registered BabyJubjub point from the owner-held master seed. */
export function deriveGpruBalanceScanKeyV1(masterSeed: Uint8Array): { secret: bigint; publicKey: BabyJubPointV1 } {
  if (!(masterSeed instanceof Uint8Array) || masterSeed.length < 32) throw new Error("TIN master seed must contain at least 32 bytes");
  const input = new Uint8Array(KEY_DOMAIN.length + masterSeed.length);
  input.set(KEY_DOMAIN);
  input.set(masterSeed, KEY_DOMAIN.length);
  let secret = scalarFromBytes(sha256(input)) % ORDER;
  if (secret === 0n) secret = 1n;
  return { secret, publicKey: multiply(BASE, secret) };
}

/** Encrypt a BabyJubjub scalar using a fresh one-time ECDH point. C = delta + x(e*S) mod subgroup order. */
export function encryptBalanceBlindingDeltaV1(params: {
  delta: bigint;
  scanPublicKey: BabyJubPointV1;
  ephemeralScalar?: bigint;
}): { encryptedDelta: bigint; ephemeralPublicKey: BabyJubPointV1; ephemeralScalar: bigint } {
  if (params.delta <= 0n || params.delta >= ORDER) throw new Error("GPRU blinding delta must be a nonzero BabyJubjub scalar");
  assertPoint(params.scanPublicKey, "GPRU balance scan public key");
  const random = new Uint8Array(32);
  if (params.ephemeralScalar === undefined) {
    globalThis.crypto.getRandomValues(random);
  }
  let ephemeralScalar = params.ephemeralScalar ?? (scalarFromBytes(random) % ORDER);
  if (ephemeralScalar === 0n) ephemeralScalar = 1n;
  if (ephemeralScalar >= ORDER) throw new Error("GPRU delta ephemeral scalar is outside the BabyJubjub subgroup order");
  const ephemeralPublicKey = multiply(BASE, ephemeralScalar);
  const shared = multiply(params.scanPublicKey, ephemeralScalar);
  return {
    encryptedDelta: mod(params.delta + shared.x, ORDER),
    ephemeralPublicKey,
    ephemeralScalar,
  };
}

/** Recover and authenticate the proof-bound blinding delta from a Memo prefix. */
export function decryptBalanceBlindingDeltaV1(params: {
  encryptedDelta: bigint;
  ephemeralPublicKey: BabyJubPointV1;
  scanSecret: bigint;
}): bigint {
  if (params.encryptedDelta < 0n || params.encryptedDelta >= ORDER || params.scanSecret <= 0n || params.scanSecret >= ORDER) {
    throw new Error("GPRU encrypted delta or scan secret is outside the BabyJubjub scalar field");
  }
  assertPoint(params.ephemeralPublicKey, "GPRU delta ephemeral public key");
  return mod(params.encryptedDelta - multiply(params.ephemeralPublicKey, params.scanSecret).x, ORDER);
}

export function encodeBabyJubFieldHexV1(value: bigint): string {
  if (value < 0n || value >= FIELD) throw new Error("BabyJubjub coordinate is outside the base field");
  return value.toString(16).padStart(64, "0");
}

export function encodeBabyJubScalarHexV1(value: bigint): string {
  if (value < 0n || value >= ORDER) throw new Error("BabyJubjub scalar is outside the subgroup order");
  return value.toString(16).padStart(64, "0");
}

export function decodeBabyJubHexV1(value: string, label: string): bigint {
  if (!/^[0-9a-f]{64}$/iu.test(value)) throw new Error(`${label} must be 32-byte hex`);
  return BigInt(`0x${value}`);
}

export function encodeBabyJubKeyV1(point: BabyJubPointV1): { x: Uint8Array; y: Uint8Array } {
  assertPoint(point, "GPRU balance scan public key");
  return { x: to32BE(point.x), y: to32BE(point.y) };
}
