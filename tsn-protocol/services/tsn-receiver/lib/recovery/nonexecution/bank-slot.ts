import { fail } from "./fail";

/** bankSlot component. Inputs and results retain the original failed-settlement-resolution contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export const bankSlot = (value: unknown, minimum: number) => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) < 1) return fail("STALE_RPC_CONTEXT");
  return Number(value);
};
