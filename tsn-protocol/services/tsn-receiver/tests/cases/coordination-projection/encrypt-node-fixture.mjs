import { createCipheriv } from "node:crypto";

/** Public deterministic test material; never used for a live payload or service. */
export function encryptNodeFixture(key, plaintext) {
  const iv = Buffer.alloc(12, 19);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { version: 1, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}
