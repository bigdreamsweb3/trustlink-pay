import type { ReceiverWork } from "../models";
import { nonExecutionContextCommitment } from "./non-execution-context-commitment";
import { payloadCommitment } from "../commitments/payload-commitment";

/**
 * Check exact failed-settlement recovery versions, lease absence, signature and context commitments.
 * Input: the explicit typed parameters below. Output: Boolean guard; an unbound annotation never resolves work.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Canonical serialization/hash errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function hasResolvedNonExecution(work: ReceiverWork): boolean {
  const resolution = work.nonExecutionResolution;
  return work.kind === "SETTLEMENT" && work.status === "FAILED" && !work.nodeLease && !work.crankerLease
    && resolution?.kind === "EXPIRED_UNCHANGED_ROOT"
    && Number.isSafeInteger(resolution.previousStateVersion)
    && resolution.resolvedStateVersion === work.stateVersion
    && Number(resolution.previousStateVersion) + 1 === work.stateVersion
    && resolution.signature === work.result?.signature
    && resolution.contextCommitment === nonExecutionContextCommitment(work)
    && resolution.checkpointCommitment === payloadCommitment(work.result)
    && resolution.authorizationCommitment === payloadCommitment(work.authorization)
    && resolution.verificationCommitment === payloadCommitment(work.verification)
    && resolution.payloadCommitment === work.payloadCommitment;
}
