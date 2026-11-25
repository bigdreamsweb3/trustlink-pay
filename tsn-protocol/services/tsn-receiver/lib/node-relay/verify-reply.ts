import { verify } from "node:crypto";
import { configuredPublicKey } from "../security/node-attestation/configured-public-key";
import { relayReplyMessage } from "./reply-message";
import type { RelayDependencies, RelayJob, RelayReply } from "./types";

/** Verify the pinned Node reply before persisting or releasing any application/signing result. */
export function verifyRelayReply(dependencies: Pick<RelayDependencies, "environment">, job: RelayJob, owner: string, reply: RelayReply): void {
  if (!Number.isInteger(reply?.status) || reply.status < 200 || reply.status > 599
      || typeof reply.body !== "string" || Buffer.byteLength(reply.body, "utf8") > 262144
      || typeof reply.contentType !== "string" || reply.contentType.length > 128 || /[\r\n]/.test(reply.contentType)
      || typeof reply.signatureBase64 !== "string") throw new Error("NODE_RELAY_REPLY_INVALID");
  const signature = Buffer.from(reply.signatureBase64, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== reply.signatureBase64
      || !verify(null, Buffer.from(relayReplyMessage(job.id, job.requestHash, job.version, owner, reply.status, reply.body, reply.contentType)),
        configuredPublicKey(dependencies).key, signature)) throw new Error("NODE_RELAY_REPLY_SIGNATURE_INVALID");
}
