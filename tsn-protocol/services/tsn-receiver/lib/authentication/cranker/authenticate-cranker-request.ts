import type { Dependencies } from "./dependencies";
import { createHash } from "node:crypto";
import { verify } from "node:crypto";
import type { NextRequest } from "next/server";
import { validTimestamp } from "./valid-timestamp";
import { canonicalSessionRequest } from "./canonical-session-request";
import { publicKeyObject } from "./public-key-object";
import { decodeSignature } from "./decode-signature";
import { consumeCrankerSessionRequest } from "./consume-cranker-session-request";

/** authenticateCrankerRequest component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function authenticateCrankerRequest(dependencies: Pick<Dependencies, "clock" | "sessionCollection" | "database">, request: NextRequest, body: string, method: string, path: string) {
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
  if (!validTimestamp(dependencies, timestamp)) throw new Error("CRANKER_REQUEST_EXPIRED");
  const counterValue = Number(counter);
  if (!Number.isSafeInteger(counterValue) || counterValue < 1) throw new Error("CRANKER_REQUEST_COUNTER_INVALID");
  if (!verify(null, Buffer.from(canonicalSessionRequest(method, path, timestamp, sessionId, counter, body)), publicKeyObject(publicKey), decodeSignature(signature))) {
    throw new Error("CRANKER_SIGNATURE_INVALID");
  }

  const reference = dependencies.sessionCollection.doc(sessionId);
  const now = dependencies.clock.now();
  const nowIso = new dependencies.clock(now).toISOString();
  const tokenHash = createHash("sha256").update(token).digest();
  const result = await dependencies.database.runTransaction(consumeCrankerSessionRequest.bind(null, dependencies, { reference, publicKey, tokenHash, now, counterValue, nowIso }));
  if (result !== "OK") throw new Error(result);
  return publicKey;
}
