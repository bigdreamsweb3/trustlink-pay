

/** isUnexpectedAccount component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function isUnexpectedAccount(context: { expected: Set<string> }, k: string) {
const { expected } = context;
return !expected.has(k);
}
