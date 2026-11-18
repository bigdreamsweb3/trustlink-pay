import type { Dependencies } from "./dependencies";
import { createHash } from "node:crypto";
import { randomBytes } from "node:crypto";
import { verify } from "node:crypto";
import { validTimestamp } from "./valid-timestamp";
import { sessionChallengeMessage } from "./session-challenge-message";
import { publicKeyObject } from "./public-key-object";
import { decodeSignature } from "./decode-signature";
import { challengeId } from "./challenge-id";
import { consumeCrankerChallenge } from "./consume-cranker-challenge";
import { CRANKER_SESSION_TTL_MS } from "./configuration";

/** issueCrankerSession component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function issueCrankerSession(dependencies: Pick<Dependencies, "clock" | "challengeCollection" | "database" | "sessionCollection">, input: {
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
  if (!validTimestamp(dependencies, timestamp)) throw new Error("CRANKER_REQUEST_EXPIRED");
  if (!verify(null, Buffer.from(sessionChallengeMessage(publicKey, timestamp, nonce)), publicKeyObject(publicKey), decodeSignature(signature))) {
    throw new Error("CRANKER_SIGNATURE_INVALID");
  }

  const reference = dependencies.challengeCollection.doc(challengeId(publicKey, nonce));
  const consumed = await dependencies.database.runTransaction(consumeCrankerChallenge.bind(null, dependencies, { reference, publicKey }));
  if (!consumed) throw new Error("CRANKER_CHALLENGE_INVALID_OR_REPLAYED");

  const now = dependencies.clock.now();
  const sessionId = randomBytes(24).toString("base64url");
  const token = randomBytes(32).toString("base64url");
  const createdAt = new dependencies.clock(now).toISOString();
  const expiresAt = new dependencies.clock(now + CRANKER_SESSION_TTL_MS).toISOString();
  await dependencies.sessionCollection.doc(sessionId).create({
    publicKey,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    createdAt,
    expiresAt,
    lastSeenAt: createdAt,
    lastCounter: 0,
  });
  return { sessionId, token, expiresAt };
}
