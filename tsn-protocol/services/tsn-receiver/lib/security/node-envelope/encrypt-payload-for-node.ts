import type { Dependencies } from "./dependencies";
import { createCipheriv } from "node:crypto";
import { randomBytes } from "node:crypto";
import { key } from "./key";
import { NodePayloadEnvelope } from "./configuration";

/** encryptPayloadForNode component. Inputs and results retain the original node-envelope contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function encryptPayloadForNode(dependencies: Pick<Dependencies, "environment">, payload: Record<string, unknown>): NodePayloadEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(dependencies), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return { version: 1, iv: iv.toString("base64url"), ciphertext: ciphertext.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
}
