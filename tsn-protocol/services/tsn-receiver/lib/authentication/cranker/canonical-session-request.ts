import { createHash } from "node:crypto";

/** canonicalSessionRequest component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function canonicalSessionRequest(method: string, path: string, timestamp: string, sessionId: string, counter: string, body: string) {
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  return `TSN_RECEIVER_CRANKER_SESSION_REQUEST_V1|${method.toUpperCase()}|${path}|${timestamp}|${sessionId}|${counter}|${bodyHash}`;
}
