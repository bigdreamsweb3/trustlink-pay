import { createHash } from "node:crypto";
import { stableNodeValue } from "./stable-node-value";

/** nodeCommitment component. Inputs and results retain the original node-verification contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function nodeCommitment(value: unknown) {
  return createHash("sha256").update(stableNodeValue(value)).digest("hex");
}
