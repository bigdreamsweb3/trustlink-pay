import { fail } from "./fail";

/** u64 component. Inputs and results retain the original failed-settlement-resolution contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export const u64 = (value: unknown) => {
  if (!/^[1-9]\d*$/.test(String(value))) return fail("INVALID_CONTEXT");
  const parsed = BigInt(String(value));
  if (parsed > 0xffffffffffffffffn) return fail("INVALID_CONTEXT");
  return parsed;
};
