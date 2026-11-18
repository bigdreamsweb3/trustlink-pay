

/** staleDocumentEntry component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function staleDocumentEntry(document: any) : [any, any] {
return [document.id, document.ref];
}
