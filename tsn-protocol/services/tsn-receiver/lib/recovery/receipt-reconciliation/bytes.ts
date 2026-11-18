

/** bytes component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export const bytes = (value: unknown, length: number) => {
  if (typeof value !== "string" || !new RegExp(`^[a-fA-F0-9]{${length * 2}}$`).test(value)) throw new Error("SETTLEMENT_RECONCILIATION_INVALID_TRANSITION");
  return Buffer.from(value, "hex");
};
