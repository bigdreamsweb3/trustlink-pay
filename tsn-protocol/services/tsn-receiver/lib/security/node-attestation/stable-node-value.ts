import { compareNodeValueKeys } from "./compare-node-value-keys";
import { formatNodeValueEntry } from "./format-node-value-entry";

/** stableNodeValue component. Inputs and results retain the original node-verification contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function stableNodeValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableNodeValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(compareNodeValueKeys)
      .map(formatNodeValueEntry).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
