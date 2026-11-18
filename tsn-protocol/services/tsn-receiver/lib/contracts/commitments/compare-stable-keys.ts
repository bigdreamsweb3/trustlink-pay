

/**
 * Compare canonical object keys with the unchanged locale-based comparator.
 * Input: the explicit typed parameters below. Output: The localeCompare ordering result.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Native string comparator errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function compareStableKeys([a]: [string, unknown], [b]: [string, unknown]): number {
  return a.localeCompare(b);
}
