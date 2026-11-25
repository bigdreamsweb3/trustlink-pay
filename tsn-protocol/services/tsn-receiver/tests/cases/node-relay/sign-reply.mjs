import { sign } from "node:crypto";

export function signReply(context, job, body = '{"ok":true}', owner = "local-node") {
  const status = 200, contentType = "application/json";
  const signatureBase64 = sign(null, Buffer.from(context.relayReplyMessage(job.id, job.requestHash, job.version, owner, status, body, contentType)), context.nodeKeys.privateKey).toString("base64");
  return { status, body, contentType, signatureBase64 };
}
