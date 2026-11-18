

/** hasAttestationLineBreak component. Inputs and results retain the original node-verification contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function hasAttestationLineBreak(value: string) {
return value.includes("\n") || value.includes("\r");
}
