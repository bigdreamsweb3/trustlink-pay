

/** stateFieldEntry component. Inputs and results retain the original node-state-store contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function stateFieldEntry(document: any) : [any, any] {
return [
        String(document.get("field")),
        document.get("value"),
      ];
}
