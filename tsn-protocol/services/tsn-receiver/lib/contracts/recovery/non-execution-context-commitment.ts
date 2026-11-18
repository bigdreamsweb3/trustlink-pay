import type { ReceiverWork } from "../models";
import { payloadCommitment } from "../commitments/payload-commitment";

/**
 * Hash the original work context with mutable recovery/version annotations removed.
 * Input: the explicit typed parameters below. Output: Existing SHA-256 context commitment.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Canonical serialization/hash errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function nonExecutionContextCommitment(work: ReceiverWork): string {
  const original = { ...work } as Record<string, unknown>;
  for (const key of ["stateVersion", "updatedAt", "nonExecutionResolution", "nonExecutionHistory"]) delete original[key];
  return payloadCommitment(original);
}
