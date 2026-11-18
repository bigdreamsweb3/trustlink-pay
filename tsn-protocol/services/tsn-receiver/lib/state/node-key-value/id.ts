import { createHash } from "node:crypto";

/** id component. Inputs and results retain the original node-state-store contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export const id = (value: string) => createHash("sha256").update(value).digest("hex");
