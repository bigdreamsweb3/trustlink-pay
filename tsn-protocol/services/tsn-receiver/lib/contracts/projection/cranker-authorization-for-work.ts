import type { ReceiverWork } from "../models";
import { allowlistedEntry } from "./allowlisted-entry";
import { crankerExecutionPayload } from "./cranker-execution-payload";
import { nonTransitionAuthorizationEntry } from "./non-transition-authorization-entry";
import { payloadCommitment } from "../commitments/payload-commitment";
import { verifiedPayloadForWork } from "../verification/verified-payload-for-work";

/**
 * Bind current accounting/settlement authorization to the exact projected verified transition and preserve other supported contracts.
 * Input: the explicit typed parameters below. Output: Existing sanitized authorization; unrelated authorization kinds retain their existing passthrough behavior.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Existing coordination mismatch, retired-credit, required-transition and transition-mismatch errors.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function crankerAuthorizationForWork(work: ReceiverWork, authorization: Record<string, unknown>): Record<string, unknown> {
  if (work.kind === "TIN_DEBIT") {
    const field = "tcapTinDebitTransition";
    const expected = crankerExecutionPayload(work.kind, verifiedPayloadForWork(work) ?? {})[field];
    const transition = crankerExecutionPayload(work.kind, { [field]: authorization.transition })[field];
    if (authorization.kind !== "TSN_TCAP_GPRU_TIN_DEBIT_AUTHORIZATION_V1" || payloadCommitment(expected) !== payloadCommitment(transition)) throw new Error("TIN_DEBIT_AUTHORIZATION_MISMATCH");
    const allowed = new Set(["kind", "workStateVersion", "leaseId", "leaseVersion", "leaseExpiresAt", "expiresAtTs"]);
    return { ...Object.fromEntries(Object.entries(authorization).filter(allowlistedEntry.bind(null, allowed))), transition };
  }
  if (work.kind === "TCAP_EPOCH_ACCOUNTING") {
    const field = "tcapEpochAccounting";
    const expected = crankerExecutionPayload(work.kind, verifiedPayloadForWork(work) ?? {})[field];
    const transition = crankerExecutionPayload(work.kind, { [field]: authorization.transition })[field];
    if (authorization.kind !== "TSN_TCAP_COORDINATION_AUTHORIZATION_V1" || !expected || payloadCommitment(expected) !== payloadCommitment(transition)) throw new Error("PRIVATE_COORDINATION_AUTHORIZATION_MISMATCH");
    const allowed = new Set(["kind", "transition", "workStateVersion", "leaseId", "leaseVersion", "leaseExpiresAt", "expiresAtTs"]);
    return { ...Object.fromEntries(Object.entries(authorization).filter(nonTransitionAuthorizationEntry.bind(null, allowed))), transition };
  }
  if (/^TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V[12]$/.test(String(authorization.kind))) throw new Error("RETIRED_CREDIT_AUTHORIZATION");
  if (authorization.kind !== "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3") return authorization;
  const received = authorization.transition;
  if (work.kind !== "SETTLEMENT" || !received || typeof received !== "object" || Array.isArray(received)) {
    throw new Error("SETTLEMENT_AUTHORIZATION_TRANSITION_REQUIRED");
  }
  const expected = crankerExecutionPayload("SETTLEMENT", verifiedPayloadForWork(work) ?? {}).tcapCreditTransition;
  const transition = crankerExecutionPayload("SETTLEMENT", { tcapCreditTransition: received }).tcapCreditTransition;
  if (!expected || payloadCommitment(expected) !== payloadCommitment(transition)) {
    throw new Error("SETTLEMENT_AUTHORIZATION_TRANSITION_MISMATCH");
  }
  const allowed = new Set(["kind", "workStateVersion", "leaseId", "leaseVersion", "leaseExpiresAt", "expiresAtTs"]);
  return { ...Object.fromEntries(Object.entries(authorization).filter(allowlistedEntry.bind(null, allowed))), transition };
}
