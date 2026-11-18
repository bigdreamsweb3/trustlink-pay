

/** isInvalidAccountIndex component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function isInvalidAccountIndex(context: { count: number }, index: number) {
const { count } = context;
return index >= count;
}
