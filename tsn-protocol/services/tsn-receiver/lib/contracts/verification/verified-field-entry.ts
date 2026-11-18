

/**
 * Retain one approved field value from the same explicit verified payload.
 * Input: the explicit typed parameters below. Output: The existing [key, value] entry.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Property-access errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function verifiedFieldEntry(verified: Record<string, unknown>, key: string): [string, unknown] {
  return [key, verified[key]];
}
