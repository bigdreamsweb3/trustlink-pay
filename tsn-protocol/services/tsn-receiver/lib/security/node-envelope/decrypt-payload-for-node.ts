import type { Dependencies } from "./dependencies";
import { createDecipheriv } from "node:crypto";
import { key } from "./key";
import { NodePayloadEnvelope } from "./configuration";

/** decryptPayloadForNode component. Inputs and results retain the original node-envelope contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function decryptPayloadForNode(dependencies: Pick<Dependencies, "environment">, envelope: NodePayloadEnvelope): Record<string, unknown> {
  if (envelope?.version !== 1) throw new Error("NODE_PAYLOAD_ENVELOPE_VERSION_UNSUPPORTED");
  const decipher = createDecipheriv("aes-256-gcm", key(dependencies), Buffer.from(envelope.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]).toString("utf8");
  const payload = JSON.parse(plaintext) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("NODE_PAYLOAD_ENVELOPE_INVALID");
  return payload as Record<string, unknown>;
}
