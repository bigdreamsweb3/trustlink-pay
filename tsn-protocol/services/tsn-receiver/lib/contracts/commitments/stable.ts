import { compareStableKeys } from "./compare-stable-keys";
import { formatStableEntry } from "./format-stable-entry";

/**
 * Serialize supplied values with unchanged array order, locale-based object-key order and JSON scalar behavior.
 * Input: the explicit typed parameters below. Output: Existing canonical representation used by payload comparisons and commitments.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Native JSON/recursion errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(compareStableKeys)
      .map(formatStableEntry.bind(null, stable)).join(",")}}`;
  }
  return JSON.stringify(value);
}
