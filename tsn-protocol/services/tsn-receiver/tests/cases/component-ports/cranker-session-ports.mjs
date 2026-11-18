import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PublicKey } from "@solana/web3.js";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { isFulfilledClaim } from "./is-fulfilled-claim.mjs";
import { isRejectedClaim } from "./is-rejected-claim.mjs";
import { fixedDate } from "./fixed-date.mjs";
import { currentSyntheticTime as fixedNow } from "../private-credit-coordination/current-synthetic-time.mjs";

/** Synthetic local storage only; no Mother-DNA RPC lookup, hosted app or live service is constructed. */
export async function crankerSessionPorts() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "receiver-cranker-ports-"));
  const previous = process.env.TSN_RECEIVER_LOCAL_FILE;
  process.env.TSN_RECEIVER_LOCAL_FILE = path.join(directory, "store.json");
  try {
    await compileReceiverFixture(directory, ["local-firestore.ts", "authentication/cranker/issue-cranker-session.ts",
      "authentication/cranker/authenticate-cranker-request.ts", "authentication/cranker/enforce-cranker-lease-rate-limit.ts"]);
    const { localDb } = await import(pathToFileURL(path.join(directory, "local-firestore.mjs")).href);
    const { issueCrankerSession } = await import(pathToFileURL(path.join(directory, "authentication/cranker/issue-cranker-session.mjs")).href);
    const { authenticateCrankerRequest } = await import(pathToFileURL(path.join(directory, "authentication/cranker/authenticate-cranker-request.mjs")).href);
    const { enforceCrankerLeaseRateLimit } = await import(pathToFileURL(path.join(directory, "authentication/cranker/enforce-cranker-lease-rate-limit.mjs")).href);
    const challengeCollection = localDb.collection("test_challenges");
    const sessionCollection = localDb.collection("test_sessions");
    const rateCollection = localDb.collection("test_rates");
    const now = Date.now();
    const clock = fixedDate.bind(null, now);
    clock.now = fixedNow.bind(null, now);
    clock.parse = Date.parse;
    const dependencies = { database: localDb, challengeCollection, sessionCollection, rateCollection, clock };
    const pair = generateKeyPairSync("ed25519");
    const publicKey = new PublicKey(pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32)).toBase58();
    const nonce = randomBytes(32).toString("base64url");
    const timestamp = String(Math.floor(now / 1000));
    const challenge = { publicKey, nonce, expiresAt: new Date(now + 60_000).toISOString(), used: false };
    const challengeId = createHash("sha256").update(`${publicKey}|${nonce}`).digest("hex");
    await challengeCollection.doc(challengeId).create(challenge);
    const signature = sign(null, Buffer.from(`TSN_RECEIVER_CRANKER_SESSION_V1|${publicKey}|${timestamp}|${nonce}`), pair.privateKey).toString("base64");
    const input = { publicKey, nonce, timestamp, signature };
    const session = await issueCrankerSession(dependencies, input);
    await assert.rejects(issueCrankerSession(dependencies, input), /CRANKER_CHALLENGE_INVALID_OR_REPLAYED/);
    assert.equal((await challengeCollection.doc(challengeId).get()).get("used"), true);
    const body = JSON.stringify({ kinds: ["SETTLEMENT"] });
    const method = "POST", route = "/api/cranker/lease", counter = "1";
    const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
    const requestSignature = sign(null, Buffer.from(`TSN_RECEIVER_CRANKER_SESSION_REQUEST_V1|${method}|${route}|${timestamp}|${session.sessionId}|${counter}|${bodyHash}`), pair.privateKey).toString("base64");
    const request = new Request("http://receiver.invalid" + route, { method, headers: {
      "x-cranker-public-key": publicKey, "x-cranker-session-id": session.sessionId,
      "x-cranker-session-token": session.token, "x-cranker-counter": counter,
      "x-cranker-timestamp": timestamp, "x-cranker-signature": requestSignature,
    }, body });
    const first = authenticateCrankerRequest(dependencies, request, body, method, route);
    const second = authenticateCrankerRequest(dependencies, request, body, method, route);
    const claims = await Promise.allSettled([first, second]);
    assert.equal(claims.filter(isFulfilledClaim).length, 1);
    assert.equal(claims.filter(isRejectedClaim).length, 1);
    const rejected = claims.find(isRejectedClaim);
    assert.match(rejected.reason.message, /CRANKER_REQUEST_REPLAYED/);
    assert.equal((await sessionCollection.doc(session.sessionId).get()).get("lastCounter"), 1);
    await assert.rejects(authenticateCrankerRequest(dependencies, request, body + " ", method, route), /CRANKER_SIGNATURE_INVALID/);
    const bucket = `${publicKey}|${Math.floor(now / 60_000)}`;
    const bucketId = createHash("sha256").update(bucket).digest("hex");
    await rateCollection.doc(bucketId).create({ publicKey, bucket, count: 29, updatedAt: new Date().toISOString() });
    await enforceCrankerLeaseRateLimit(dependencies, publicKey);
    await assert.rejects(enforceCrankerLeaseRateLimit(dependencies, publicKey), /CRANKER_LEASE_RATE_LIMITED/);
    assert.equal((await rateCollection.doc(bucketId).get()).get("count"), 30);
  } finally {
    if (previous === undefined) delete process.env.TSN_RECEIVER_LOCAL_FILE;
    else process.env.TSN_RECEIVER_LOCAL_FILE = previous;
    await rm(directory, { recursive: true, force: true });
  }
}
