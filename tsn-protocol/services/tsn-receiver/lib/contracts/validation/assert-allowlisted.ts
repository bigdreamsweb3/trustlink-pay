

/**
 * Validate object keys against the explicit caller-owned field set and error context.
 * Input: the explicit typed parameters below. Output: No return value when all keys are allowed.
 * Dependencies: named imports; no service/database initialization.
 * Errors: UNSUPPORTED_PAYLOAD_FIELD with the original context and offending key.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function assertAllowlisted(value: Record<string, unknown>, allowed: Set<string>, context: string) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`UNSUPPORTED_PAYLOAD_FIELD:${context}.${key}`);
}
