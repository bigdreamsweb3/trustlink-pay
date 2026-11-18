import { bytes } from "./bytes";

/** proofInputBytes component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function proofInputBytes(v:unknown) {
return bytes(v,32);
}
