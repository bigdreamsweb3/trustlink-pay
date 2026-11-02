import { createHash } from "node:crypto";
import { payloadCommitment, type ReceiverWork } from "./work-contract";

/** Requeue an unsubmitted settlement after snapshot or TCAP asset-preflight repair. */
export function snapshotRetryPatch(current: ReceiverWork, funding: ReceiverWork, expectedVersion: number, requestedBy: string) {
  if (!Number.isSafeInteger(expectedVersion) || current.stateVersion !== expectedVersion) throw new Error("STALE_STATE_VERSION");
  if (current.kind !== "SETTLEMENT" || current.status !== "REJECTED") throw new Error("SETTLEMENT_RETRY_NOT_REJECTED");
  const reason = String(current.verification?.reason ?? "");
  if (!reason.startsWith("GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE:")
      && reason !== "TCAP settlement asset is unavailable or its reserve binding is invalid") {
    throw new Error("SETTLEMENT_RETRY_REASON_NOT_ALLOWED");
  }
  if (current.nodeLease || current.crankerLease || current.authorization || (current.result && Object.keys(current.result).length)) {
    throw new Error("SETTLEMENT_RETRY_HAS_EXECUTION_STATE");
  }
  if (funding.kind !== "AUTHORIZED_FUNDING" || funding.status !== "CONFIRMED" || !funding.result?.signature) {
    throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
  }
  const expectedId = `settlement-${createHash("sha256").update(`${funding.id}:${funding.payloadCommitment}`).digest("hex").slice(0, 32)}`;
  if (current.id !== expectedId || current.payload.intentId !== funding.id || payloadCommitment(current.payload) !== current.payloadCommitment) {
    throw new Error("SETTLEMENT_FUNDING_REFERENCE_MISMATCH");
  }
  const retriedAt = new Date().toISOString();
  return {
    status: "RECEIVED" as const, stateVersion: current.stateVersion + 1, updatedAt: retriedAt,
    verification: null, nodeLease: null, crankerLease: null, authorization: null,
    retryHistory: [...(current.retryHistory ?? []), {
      rejectedStateVersion: current.stateVersion, retriedAt, requestedBy,
      rejection: current.verification, fundingWorkId: funding.id,
      fundingStateVersion: funding.stateVersion, fundingSignature: funding.result.signature,
    }],
  };
}
