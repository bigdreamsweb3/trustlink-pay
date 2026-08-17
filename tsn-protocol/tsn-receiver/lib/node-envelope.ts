import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type NodePayloadEnvelope = { version: 1; iv: string; ciphertext: string; tag: string };

function key() {
  const value = (process.env.TSN_RECEIVER_NODE_PAYLOAD_KEY ?? "").trim();
  if (!value) throw new Error("NODE_PAYLOAD_ENCRYPTION_KEY_REQUIRED");
  const bytes = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (bytes.length !== 32) throw new Error("NODE_PAYLOAD_ENCRYPTION_KEY_INVALID");
  return bytes;
}

export function encryptPayloadForNode(payload: Record<string, unknown>): NodePayloadEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return { version: 1, iv: iv.toString("base64url"), ciphertext: ciphertext.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
}

export function decryptPayloadForNode(envelope: NodePayloadEnvelope): Record<string, unknown> {
  if (envelope?.version !== 1) throw new Error("NODE_PAYLOAD_ENVELOPE_VERSION_UNSUPPORTED");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(envelope.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]).toString("utf8");
  const payload = JSON.parse(plaintext) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("NODE_PAYLOAD_ENVELOPE_INVALID");
  return payload as Record<string, unknown>;
}
