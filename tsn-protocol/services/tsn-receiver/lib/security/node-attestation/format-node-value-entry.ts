import { stableNodeValue } from "./stable-node-value";

/** formatNodeValueEntry component. Inputs and results retain the original node-verification contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function formatNodeValueEntry([key, child]: [string, unknown]) {
return `${JSON.stringify(key)}:${stableNodeValue(child)}`;
}
