import { createHash } from "node:crypto";
/** Readable but case-collision safe on Windows; exact values stay in manifest/records. */
export function safeToken(value: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 16);
  const label = value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 44) || "value";
  return `${label}--${digest}`;
}
