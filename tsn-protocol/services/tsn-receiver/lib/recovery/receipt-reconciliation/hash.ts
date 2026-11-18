import { createHash } from "node:crypto";

/** hash component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export const hash = (value: string) => createHash("sha256").update(value).digest();
