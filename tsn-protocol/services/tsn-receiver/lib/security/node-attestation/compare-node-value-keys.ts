

/** compareNodeValueKeys component. Inputs and results retain the original node-verification contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function compareNodeValueKeys([left]: [string, unknown], [right]: [string, unknown]) {
return left < right ? -1 : left > right ? 1 : 0;
}
