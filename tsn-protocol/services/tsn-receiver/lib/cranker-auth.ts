import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import type { NextRequest } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { db } from "./firebase";

const challengeCollection = db.collection(process.env.TSN_RECEIVER_CRANKER_CHALLENGE_COLLECTION ?? "tsn_receiver_cranker_challenges");
const rateCollection = db.collection(process.env.TSN_RECEIVER_CRANKER_RATE_COLLECTION ?? "tsn_receiver_cranker_rate_limits");
const sessionCollection = db.collection(process.env.TSN_RECEIVER_CRANKER_SESSION_COLLECTION ?? "tsn_receiver_cranker_sessions");
const CHALLENGE_TTL_MS = 60_000;
const CRANKER_SESSION_TTL_MS = 30 * 60_000;
const CRANKER_SESSION_IDLE_TTL_MS = 5 * 60_000;
const MAX_LEASE_ATTEMPTS_PER_MINUTE = 30;

// This Receiver admission boundary is pinned to the verified Devnet TSN
// deployment. A stale hosted environment variable must not silently move
// Mother-DNA validation to another program or cluster.
const VERIFIED_TSN_PROGRAM_ID = "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V";
const DEFAULT_TSN_RPC_GATEWAY_URL = "https://tsn-rpc-gateway.vercel.app";
const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const TSN_PROGRAM_ID = new PublicKey(VERIFIED_TSN_PROGRAM_ID);
const SOLANA_RPC_URLS = Array.from(new Set([process.env.TSN_RPC_URL?.trim()
  || process.env.TSN_RPC_GATEWAY_URL?.trim()
  || DEFAULT_TSN_RPC_GATEWAY_URL, DEVNET_RPC_URL].filter((url): url is string => Boolean(url))));
const MOTHER_SEED = Buffer.from("tsn_mother_escrow");
const CRANKER_SEED = Buffer.from("tsn_cranker");
const ANCHOR_DISCRIMINATOR_BYTES = 8;
const PUBKEY_BYTES = 32;

async function assertMotherDnaCranker(operatorText: string): Promise<void> {
  let operator: PublicKey;
  try {
    operator = new PublicKey(operatorText);
  } catch {
    throw new Error("CRANKER_PUBLIC_KEY_INVALID");
  }

  const mother = PublicKey.findProgramAddressSync([MOTHER_SEED], TSN_PROGRAM_ID)[0];
  const cranker = PublicKey.findProgramAddressSync(
    [CRANKER_SEED, mother.toBuffer(), operator.toBuffer()],
    TSN_PROGRAM_ID,
  )[0];
  let motherInfo = null;
  let crankerInfo = null;
  let rpcFailure: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      let lastError: unknown;
      for (const rpcUrl of SOLANA_RPC_URLS) {
        try {
          const connection = new Connection(rpcUrl, "confirmed");
          [motherInfo, crankerInfo] = await Promise.all([
            connection.getAccountInfo(mother, "confirmed"),
            connection.getAccountInfo(cranker, "confirmed"),
          ]);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) throw lastError;
      rpcFailure = undefined;
      break;
    } catch (error) {
      rpcFailure = error;
      const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
      if (attempt === 3 || !/fetch failed|timeout|timed out|ECONNRESET|EAI_AGAIN|UND_ERR_CONNECT/i.test(message)) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  if (rpcFailure) {
    throw new Error("CRANKER_RPC_UNAVAILABLE: Mother-DNA lookup failed at the configured RPC endpoint after retries");
  }
  if (!motherInfo || !crankerInfo || !motherInfo.owner.equals(TSN_PROGRAM_ID) || !crankerInfo.owner.equals(TSN_PROGRAM_ID)) {
    throw new Error("CRANKER_MOTHER_DNA_NOT_FOUND");
  }

  const motherData = motherInfo.data;
  const crankerData = crankerInfo.data;
  const motherProtocolSeedOffset = ANCHOR_DISCRIMINATOR_BYTES + PUBKEY_BYTES + PUBKEY_BYTES;
  const crankerOperatorOffset = ANCHOR_DISCRIMINATOR_BYTES + PUBKEY_BYTES;
  const crankerDnaOffset = crankerOperatorOffset + PUBKEY_BYTES;
  if (motherData.length < motherProtocolSeedOffset + PUBKEY_BYTES || crankerData.length < crankerDnaOffset + PUBKEY_BYTES) {
    throw new Error("CRANKER_ACCOUNT_LAYOUT_INVALID");
  }
  if (!crankerData.subarray(ANCHOR_DISCRIMINATOR_BYTES, crankerOperatorOffset).equals(mother.toBuffer())) {
    throw new Error("CRANKER_MOTHER_DNA_MISMATCH");
  }
  if (!crankerData.subarray(crankerOperatorOffset, crankerDnaOffset).equals(operator.toBuffer())) {
    throw new Error("CRANKER_OPERATOR_MISMATCH");
  }

  const expectedDna = createHash("sha256")
    .update(Buffer.concat([Buffer.from("tsn_dna"), mother.toBuffer(), operator.toBuffer(), motherData.subarray(motherProtocolSeedOffset, motherProtocolSeedOffset + PUBKEY_BYTES)]))
    .digest();
  if (!crankerData.subarray(crankerDnaOffset, crankerDnaOffset + PUBKEY_BYTES).equals(expectedDna)) {
    throw new Error("CRANKER_MOTHER_DNA_MISMATCH");
  }
}

function challengeId(publicKey: string, nonce: string) {
  return createHash("sha256").update(`${publicKey}|${nonce}`).digest("hex");
}

async function pruneCrankerChallenges() {
  const expiredAt = new Date().toISOString();
  const [used, expired] = await Promise.all([
    challengeCollection.where("used", "==", true).limit(100).get(),
    challengeCollection.where("expiresAt", "<=", expiredAt).limit(100).get(),
  ]);
  const stale = new Map([...used.docs, ...expired.docs].map((document) => [document.id, document.ref]));
  await Promise.all([...stale.values()].map((reference) => reference?.delete()));
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
  await assertMotherDnaCranker(publicKey);
  await Promise.all([pruneCrankerChallenges(), pruneCrankerSessions()]);
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  await challengeCollection.doc(challengeId(publicKey, nonce)).create({ publicKey, nonce, expiresAt, used: false });
  return { nonce, expiresAt };
}

function canonicalSessionRequest(method: string, path: string, timestamp: string, sessionId: string, counter: string, body: string) {
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  return `TSN_RECEIVER_CRANKER_SESSION_REQUEST_V1|${method.toUpperCase()}|${path}|${timestamp}|${sessionId}|${counter}|${bodyHash}`;
}

function sessionChallengeMessage(publicKey: string, timestamp: string, nonce: string) {
  return `TSN_RECEIVER_CRANKER_SESSION_V1|${publicKey}|${timestamp}|${nonce}`;
}

function validTimestamp(timestamp: string) {
  const timestampMs = Number(timestamp) * 1000;
  return Number.isFinite(timestampMs) && Math.abs(Date.now() - timestampMs) <= CHALLENGE_TTL_MS;
}

function decodeSignature(signature: string) {
  if (!/^[A-Za-z0-9+/_-]{86,88}={0,2}$/.test(signature)) throw new Error("CRANKER_SIGNATURE_INVALID");
  let bytes: Buffer;
  try { bytes = Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64"); }
  catch { throw new Error("CRANKER_SIGNATURE_INVALID"); }
  if (bytes.length !== 64) throw new Error("CRANKER_SIGNATURE_INVALID");
  return bytes;
}

export async function issueCrankerSession(input: {
  publicKey: string;
  nonce: string;
  timestamp: string;
  signature: string;
}) {
  const { publicKey, nonce, timestamp, signature } = input;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(publicKey)
    || !/^[A-Za-z0-9_-]{43}$/.test(nonce)
    || !/^\d{1,13}$/.test(timestamp)
    || !signature) throw new Error("CRANKER_SESSION_INPUT_INVALID");
  if (!validTimestamp(timestamp)) throw new Error("CRANKER_REQUEST_EXPIRED");
  if (!verify(null, Buffer.from(sessionChallengeMessage(publicKey, timestamp, nonce)), publicKeyObject(publicKey), decodeSignature(signature))) {
    throw new Error("CRANKER_SIGNATURE_INVALID");
  }

  const reference = challengeCollection.doc(challengeId(publicKey, nonce));
  const consumed = await db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.get("used") === true || snapshot.get("publicKey") !== publicKey || Date.parse(String(snapshot.get("expiresAt") ?? "")) <= Date.now()) return false;
    transaction.update(reference, { used: true, usedAt: new Date().toISOString() });
    return true;
  });
  if (!consumed) throw new Error("CRANKER_CHALLENGE_INVALID_OR_REPLAYED");

  const now = Date.now();
  const sessionId = randomBytes(24).toString("base64url");
  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + CRANKER_SESSION_TTL_MS).toISOString();
  await sessionCollection.doc(sessionId).create({
    publicKey,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    createdAt,
    expiresAt,
    lastSeenAt: createdAt,
    lastCounter: 0,
  });
  return { sessionId, token, expiresAt };
}

export async function authenticateCrankerRequest(request: NextRequest, body: string, method: string, path: string) {
  const publicKey = request.headers.get("x-cranker-public-key")?.trim() ?? "";
  const sessionId = request.headers.get("x-cranker-session-id")?.trim() ?? "";
  const token = request.headers.get("x-cranker-session-token")?.trim() ?? "";
  const counter = request.headers.get("x-cranker-counter")?.trim() ?? "";
  const timestamp = request.headers.get("x-cranker-timestamp")?.trim() ?? "";
  const signature = request.headers.get("x-cranker-signature")?.trim() ?? "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(publicKey)
    || !/^[A-Za-z0-9_-]{32}$/.test(sessionId)
    || !/^[A-Za-z0-9_-]{43}$/.test(token)
    || !/^\d{1,16}$/.test(counter) || !/^\d{1,13}$/.test(timestamp) || !signature) throw new Error("CRANKER_SESSION_INPUT_INVALID");
  if (!validTimestamp(timestamp)) throw new Error("CRANKER_REQUEST_EXPIRED");
  const counterValue = Number(counter);
  if (!Number.isSafeInteger(counterValue) || counterValue < 1) throw new Error("CRANKER_REQUEST_COUNTER_INVALID");
  if (!verify(null, Buffer.from(canonicalSessionRequest(method, path, timestamp, sessionId, counter, body)), publicKeyObject(publicKey), decodeSignature(signature))) {
    throw new Error("CRANKER_SIGNATURE_INVALID");
  }

  const reference = sessionCollection.doc(sessionId);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const tokenHash = createHash("sha256").update(token).digest();
  const result = await db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.get("publicKey") !== publicKey) return "CRANKER_SESSION_INVALID";
    const storedHash = String(snapshot.get("tokenHash") ?? "");
    if (!/^[0-9a-f]{64}$/i.test(storedHash) || !timingSafeEqual(Buffer.from(storedHash, "hex"), tokenHash)) return "CRANKER_SESSION_INVALID";
    const expiresAt = Date.parse(String(snapshot.get("expiresAt") ?? ""));
    const lastSeenAt = Date.parse(String(snapshot.get("lastSeenAt") ?? ""));
    if (!Number.isFinite(expiresAt) || expiresAt <= now || !Number.isFinite(lastSeenAt) || now - lastSeenAt > CRANKER_SESSION_IDLE_TTL_MS) return "CRANKER_SESSION_EXPIRED";
    const lastCounter = Number(snapshot.get("lastCounter") ?? 0);
    if (!Number.isSafeInteger(lastCounter) || lastCounter < 0 || counterValue <= lastCounter) return "CRANKER_REQUEST_REPLAYED";
    transaction.update(reference, { lastCounter: counterValue, lastSeenAt: nowIso });
    return "OK";
  });
  if (result !== "OK") throw new Error(result);
  return publicKey;
}

async function pruneCrankerSessions() {
  const now = Date.now();
  const [expired, idle] = await Promise.all([
    sessionCollection.where("expiresAt", "<=", new Date(now).toISOString()).limit(100).get(),
    sessionCollection.where("lastSeenAt", "<=", new Date(now - CRANKER_SESSION_IDLE_TTL_MS).toISOString()).limit(100).get(),
  ]);
  const stale = new Map([...expired.docs, ...idle.docs].map((document: any) => [document.id, document.ref]));
  await Promise.all([...stale.values()].map((reference: any) => reference?.delete()));
}

export async function enforceCrankerLeaseRateLimit(publicKey: string) {
  const now = Date.now();
  await pruneCrankerRateLimits(new Date(now - 60_000).toISOString());
  const bucket = `${publicKey}|${Math.floor(Date.now() / 60_000)}`;
  const reference = rateCollection.doc(createHash("sha256").update(bucket).digest("hex"));
  const allowed = await db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(reference);
    const count = Number(snapshot.get("count") ?? 0);
    if (count >= MAX_LEASE_ATTEMPTS_PER_MINUTE) return false;
    transaction.set(reference, { publicKey, bucket, count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  });
  if (!allowed) throw new Error("CRANKER_LEASE_RATE_LIMITED");
}

async function pruneCrankerRateLimits(updatedBefore: string) {
  const stale = await rateCollection.where("updatedAt", "<=", updatedBefore).limit(100).get();
  await Promise.all(stale.docs.map((document: { ref?: { delete: () => Promise<unknown> } }) => document.ref?.delete()));
}
