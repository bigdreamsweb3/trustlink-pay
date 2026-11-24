import type { WorkKind } from "../models";

/**
 * Validate that a public caller supplies AUTHORIZED_FUNDING or TIN_OPERATION.
 * Input: the explicit typed parameters below. Output: No return value on accepted work kinds.
 * Dependencies: named imports; no service/database initialization.
 * Errors: The existing <kind>_WORK_INTERNAL_ONLY error.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function assertExternalWorkKind(kind: WorkKind): void {
  if (!["AUTHORIZED_FUNDING", "TIN_OPERATION", "TIN_DEBIT"].includes(kind)) throw new Error(`${kind}_WORK_INTERNAL_ONLY`);
}
