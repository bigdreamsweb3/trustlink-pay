import { createHash } from "node:crypto";
import { payloadCommitment, verifiedPayloadForWork, type ReceiverWork } from "./work-contract";

export const LEGACY_MEMO_INPUT_COUNT_REJECTION = "GPRU transaction record is missing its twelve public hidden-head inputs";

export const FUNDED_ROOT_STALE = "TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT";
export const NATIVE_REVERIFY_REASONS = new Set([FUNDED_ROOT_STALE,
  "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT", "TCAP_POOL_CAPTURE_STALE",
  "TCAP_EPOCH_ALREADY_ACCOUNTED", "TCAP_CREDIT_EPOCH_CHANGED_BEFORE_SETTLEMENT",
  "TCAP_TRANSACTION_BLOCKHASH_TOO_OLD_FOR_SUBMISSION",
  "TIP route root changed since settlement verification", "TCAP credit authorization expired",
  "Cranker transaction blockhash is no longer valid; rebuild and request a fresh Mother signature"]);

function assertFundingLineage(current: ReceiverWork, funding: ReceiverWork) {
  if (funding.kind !== "AUTHORIZED_FUNDING" || funding.status !== "CONFIRMED" || !funding.result?.signature) {
    throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
  }
  const expectedId = `settlement-${createHash("sha256").update(`${funding.id}:${funding.payloadCommitment}`).digest("hex").slice(0, 32)}`;
  if (current.id !== expectedId || current.payload.intentId !== funding.id
      || current.payload.paymentId !== (funding.payload.paymentId ?? funding.id)
      || payloadCommitment(current.payload) !== current.payloadCommitment) {
    throw new Error("SETTLEMENT_FUNDING_REFERENCE_MISMATCH");
  }
}

function requeuePatch(current: ReceiverWork, funding: ReceiverWork, requestedBy: string, reason?: string) {
  const retriedAt = new Date().toISOString();
  return {
    status: "RECEIVED" as const, stateVersion: current.stateVersion + 1, updatedAt: retriedAt,
    verification: null, nodeLease: null, crankerLease: null, authorization: null,
    retryHistory: [...(current.retryHistory ?? []), {
      rejectedStateVersion: current.stateVersion, retriedAt, requestedBy,
      ...(reason ? { reason, previousStatus: current.status } : { rejection: current.verification }),
      fundingWorkId: funding.id,
      fundingStateVersion: funding.stateVersion, fundingSignature: funding.result!.signature,
    }],
  };
}

/** Requeue an unsubmitted settlement after a recognized verification defect is repaired. */
export function snapshotRetryPatch(current: ReceiverWork, funding: ReceiverWork, expectedVersion: number, requestedBy: string) {
  if (!Number.isSafeInteger(expectedVersion) || current.stateVersion !== expectedVersion) throw new Error("STALE_STATE_VERSION");
  if (current.kind !== "SETTLEMENT" || current.status !== "REJECTED") throw new Error("SETTLEMENT_RETRY_NOT_REJECTED");
  const reason = String(current.verification?.reason ?? "");
  if (!reason.startsWith("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE:")
      && reason !== LEGACY_MEMO_INPUT_COUNT_REJECTION
      && reason !== FUNDED_ROOT_STALE
      && reason !== "TCAP settlement asset is unavailable or its reserve binding is invalid") {
    throw new Error("SETTLEMENT_RETRY_REASON_NOT_ALLOWED");
  }
  if (current.nodeLease || current.crankerLease || current.authorization || (current.result && Object.keys(current.result).length)) {
    throw new Error("SETTLEMENT_RETRY_HAS_EXECUTION_STATE");
  }
  assertFundingLineage(current, funding);
  return requeuePatch(current, funding, requestedBy);
}

/** Only the active lease owner may discard an unsigned stale funded-note proof. */
export function fundedRootRetryPatch(current: ReceiverWork, funding: ReceiverWork, expectedVersion: number, owner: string, requestedBy: string) {
  if (!Number.isSafeInteger(expectedVersion) || current.stateVersion !== expectedVersion) throw new Error("STALE_STATE_VERSION");
  const lease = current.crankerLease;
  if (current.kind !== "SETTLEMENT" || current.status !== "CRANKER_LEASED" || !lease
      || lease.owner !== owner || !Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt) <= Date.now()) {
    throw new Error("SETTLEMENT_RETRY_LEASE_INVALID");
  }
  if (current.nodeLease || (current.result && Object.keys(current.result).length)) {
    throw new Error("SETTLEMENT_RETRY_HAS_EXECUTION_STATE");
  }
  const transition = verifiedPayloadForWork(current)?.tcapCreditTransition as Record<string, unknown> | undefined;
  const proof = transition?.proof as Record<string, unknown> | undefined;
  if (current.verification?.verificationType !== "TSN_TCAP_GPRU_HIDDEN_HEAD_V1"
      || !transition?.fundingRootAccount || !Array.isArray(proof?.publicInputs) || proof.publicInputs.length !== 13) {
    throw new Error("SETTLEMENT_RETRY_MODE_NOT_ALLOWED");
  }
  assertFundingLineage(current, funding);
  return requeuePatch(current, funding, requestedBy, FUNDED_ROOT_STALE);
}
