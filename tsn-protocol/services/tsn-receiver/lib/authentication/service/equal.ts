import { timingSafeEqual } from "node:crypto";

/** equal component. Inputs and results retain the original auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
