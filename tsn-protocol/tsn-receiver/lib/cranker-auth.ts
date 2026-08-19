import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "./firebase";

const challengeCollection = db.collection(process.env.TSN_RECEIVER_CRANKER_CHALLENGE_COLLECTION ?? "tsn_receiver_cranker_challenges");
const rateCollection = db.collection(process.env.TSN_RECEIVER_CRANKER_RATE_COLLECTION ?? "tsn_receiver_cranker_rate_limits");
const CHALLENGE_TTL_MS = 60_000;
const MAX_LEASE_ATTEMPTS_PER_MINUTE = 30;

type OperatorRecord = { active?: boolean; revokedAt?: string | null; label?: string };

function configuredOperators(): Record<string, OperatorRecord> {
  try {
    const parsed = JSON.parse(process.env.TSN_RECEIVER_CRANKER_OPERATORS ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, OperatorRecord> : {};
  } catch {
    throw new Error("CRANKER_OPERATOR_REGISTRY_INVALID");
  }
}

export function assertRegisteredOperator(publicKey: string): OperatorRecord {
  const record = configuredOperators()[publicKey];
  if (!record || record.active === false || record.revokedAt) throw new Error("CRANKER_OPERATOR_REVOKED_OR_UNKNOWN");
  return record;
}

function challengeId(publicKey: string, nonce: string) {
  return createHash("sha256").update(`${publicKey}|${nonce}`).digest("hex");
}

function decodeBase58(value: string): Buffer {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("CRANKER_PUBLIC_KEY_INVALID");
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0n) { bytes.unshift(Number(number & 255n)); number >>= 8n; }
  for (const character of value) { if (character === "1") bytes.unshift(0); else break; }
  const result = Buffer.from(bytes);
  if (result.length !== 32) throw new Error("CRANKER_PUBLIC_KEY_INVALID");
  return result;
}

function publicKeyObject(publicKey: string) {
  return createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), decodeBase58(publicKey)]),
    format: "der",
    type: "spki",
  });
}

export async function issueCrankerChallenge(publicKey: string) {
  assertRegisteredOperator(publicKey);
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  await challengeCollection.doc(challengeId(publicKey, nonce)).create({ publicKey, nonce, expiresAt, used: false });
  return { nonce, expiresAt };
}

function canonicalRequest(method: string, path: string, timestamp: string, nonce: string, body: string) {
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  return `TSN_RECEIVER_CRANKER_V1|${method.toUpperCase()}|${path}|${timestamp}|${nonce}|${bodyHash}`;
}

export async function authenticateCrankerRequest(request: NextRequest, body: string, method: string, path: string) {
  const publicKey = request.headers.get("x-cranker-public-key")?.trim() ?? "";
  const nonce = request.headers.get("x-cranker-challenge")?.trim() ?? "";
  const timestamp = request.headers.get("x-cranker-timestamp")?.trim() ?? "";
  const signature = request.headers.get("x-cranker-signature")?.trim() ?? "";
  assertRegisteredOperator(publicKey);
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > CHALLENGE_TTL_MS) throw new Error("CRANKER_REQUEST_EXPIRED");
  const reference = challengeCollection.doc(challengeId(publicKey, nonce));
  const consumed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.get("used") === true || snapshot.get("publicKey") !== publicKey || Date.parse(String(snapshot.get("expiresAt") ?? "")) <= Date.now()) return false;
    transaction.update(reference, { used: true, usedAt: new Date().toISOString() });
    return true;
  });
  if (!consumed) throw new Error("CRANKER_CHALLENGE_INVALID_OR_REPLAYED");
  let signatureBytes: Buffer;
  try { signatureBytes = Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64"); } catch { throw new Error("CRANKER_SIGNATURE_INVALID"); }
  if (signatureBytes.length !== 64 || !verify(null, Buffer.from(canonicalRequest(method, path, timestamp, nonce, body)), publicKeyObject(publicKey), signatureBytes)) throw new Error("CRANKER_SIGNATURE_INVALID");
  return publicKey;
}

export async function enforceCrankerLeaseRateLimit(publicKey: string) {
  const bucket = `${publicKey}|${Math.floor(Date.now() / 60_000)}`;
  const reference = rateCollection.doc(createHash("sha256").update(bucket).digest("hex"));
  const allowed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const count = Number(snapshot.get("count") ?? 0);
    if (count >= MAX_LEASE_ATTEMPTS_PER_MINUTE) return false;
    transaction.set(reference, { publicKey, bucket, count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  });
  if (!allowed) throw new Error("CRANKER_LEASE_RATE_LIMITED");
}
