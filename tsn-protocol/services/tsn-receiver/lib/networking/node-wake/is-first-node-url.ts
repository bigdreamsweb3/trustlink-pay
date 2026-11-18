

/** isFirstNodeUrl component. Inputs and results retain the original node-wake contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function isFirstNodeUrl(value: string, index: number, all: string[]) {
return all.indexOf(value) === index;
}
