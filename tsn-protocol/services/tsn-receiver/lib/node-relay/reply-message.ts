import { createHash } from "node:crypto";

/** Bind a reply to the immutable request and current relay claim, separately from Mother transaction signing. */
export function relayReplyMessage(id: string, requestHash: string, version: number, owner: string, status: number, body: string, contentType: string): string {
  const hash = createHash("sha256").update(body, "utf8").digest("hex");
  const typeHash = createHash("sha256").update(contentType, "utf8").digest("hex");
  return `TSN_NODE_RELAY_REPLY_V1|${id}|${requestHash}|${version}|${owner}|${status}|${hash}|${typeHash}`;
}
