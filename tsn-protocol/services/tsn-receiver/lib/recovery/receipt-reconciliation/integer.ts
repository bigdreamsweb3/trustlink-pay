

/** integer component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export const integer = (value: unknown, length: number) => {
  if (!/^\d+$/.test(String(value))) throw new Error("SETTLEMENT_RECONCILIATION_INVALID_TRANSITION");
  const buffer = Buffer.alloc(length); let number = BigInt(String(value));
  for (let i = 0; i < length; i++) { buffer[i] = Number(number & 255n); number >>= 8n; }
  if (number) throw new Error("SETTLEMENT_RECONCILIATION_INVALID_TRANSITION");
  return buffer;
};
