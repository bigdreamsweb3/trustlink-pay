import type { PayloadDelta } from "../models";
import { stable } from "../commitments/stable";

/**
 * Compare original and next payload entries through the existing canonical serializer.
 * Input: the explicit typed parameters below. Output: Added/changed object fields and removed key names in existing iteration order.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Canonical serialization errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function diffPayload(base: Record<string, unknown>, next: Record<string, unknown>): PayloadDelta {
  const addedFields: Record<string, unknown> = {};
  const changedFields: Record<string, unknown> = {};
  const removedFields: string[] = [];
  for (const [key, value] of Object.entries(next)) {
    if (!(key in base)) addedFields[key] = value;
    else if (stable(base[key]) !== stable(value)) changedFields[key] = value;
  }
  for (const key of Object.keys(base)) if (!(key in next)) removedFields.push(key);
  return { addedFields, changedFields, removedFields };
}
