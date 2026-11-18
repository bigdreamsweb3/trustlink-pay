

/**
 * Select an object entry through its explicit caller-owned field allowlist.
 * Input: the explicit typed parameters below. Output: Boolean predicate reused by seven compatible original callbacks.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Supplied set/pair errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function allowlistedEntry(allowed: ReadonlySet<string>, [key]: [string, unknown]): boolean {
  return allowed.has(key);
}
