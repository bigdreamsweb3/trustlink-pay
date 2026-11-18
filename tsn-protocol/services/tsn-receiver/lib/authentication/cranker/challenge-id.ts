import { createHash } from "node:crypto";

/** challengeId component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function challengeId(publicKey: string, nonce: string) {
  return createHash("sha256").update(`${publicKey}|${nonce}`).digest("hex");
}
