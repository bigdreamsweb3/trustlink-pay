import type { BatchPort } from "../../storage/ports";


/** deleteStateChild component. Inputs and results retain the original node-state-store contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function deleteStateChild(context: { batch: BatchPort }, document: any) {
const { batch } = context;
return batch.delete(document.ref);
}
