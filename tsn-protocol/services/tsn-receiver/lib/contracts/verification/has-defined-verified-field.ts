

/**
 * Select evidence fields whose values are defined in the explicit verified payload.
 * Input: the explicit typed parameters below. Output: Boolean callback result.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Property-access errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function hasDefinedVerifiedField(verified: Record<string, unknown>, key: string): boolean {
  return verified[key] !== undefined;
}
