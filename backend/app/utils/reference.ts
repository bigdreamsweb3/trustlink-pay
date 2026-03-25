import { randomBytes } from "node:crypto";

export function generatePaymentReference(): string {
  return `TL-${randomBytes(3).toString("hex").toUpperCase()}`;
}
