

/**
 * Select coordination authorization metadata while its transition is returned separately.
 * Input: the explicit typed parameters below. Output: Boolean callback result using the explicit allowlist.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Supplied set/pair errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function nonTransitionAuthorizationEntry(allowed: ReadonlySet<string>, [key]: [string, unknown]): boolean {
  return allowed.has(key) && key !== "transition";
}
