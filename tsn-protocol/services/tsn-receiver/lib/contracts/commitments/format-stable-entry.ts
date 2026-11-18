

/**
 * Encode one canonical object entry through its explicit recursive serializer.
 * Input: the explicit typed parameters below. Output: JSON-encoded key followed by its existing canonical child representation.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Native JSON and supplied serializer errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function formatStableEntry(encode: (value: unknown) => string, [key, child]: [string, unknown]): string {
  return `${JSON.stringify(key)}:${encode(child)}`;
}
