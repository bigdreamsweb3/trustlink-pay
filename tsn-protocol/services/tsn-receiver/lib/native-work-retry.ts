import { payloadCommitment, type ReceiverWork } from "./work-contract";
import { NATIVE_REVERIFY_REASONS, fundedRootRetryPatch } from "./settlement-retry";

export function nativeWorkRetryPatch(current: ReceiverWork, funding: ReceiverWork | null,
    version: number, owner: string, requestedBy: string, reason: string) {
  if (!NATIVE_REVERIFY_REASONS.has(reason)) throw new Error("SETTLEMENT_RETRY_REASON_NOT_ALLOWED");
  if (current.kind === "SETTLEMENT") {
    if (!funding) throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
    return fundedRootRetryPatch(current, funding, version, owner, requestedBy);
  }
  if (!["TCAP_FUNDING_POOL","TCAP_EPOCH_ACCOUNTING"].includes(current.kind)) throw new Error("SETTLEMENT_RETRY_MODE_NOT_ALLOWED");
  if (!Number.isSafeInteger(version) || current.stateVersion !== version) throw new Error("STALE_STATE_VERSION");
  if (current.status !== "CRANKER_LEASED" || current.crankerLease?.owner !== owner
      || !Number.isFinite(Date.parse(current.crankerLease.expiresAt)) || Date.parse(current.crankerLease.expiresAt) <= Date.now()) throw new Error("SETTLEMENT_RETRY_LEASE_INVALID");
  if (current.nodeLease || current.result?.signature) throw new Error("SETTLEMENT_RETRY_HAS_EXECUTION_STATE");
  if (payloadCommitment(current.payload) !== current.payloadCommitment) throw new Error("PRIVATE_COORDINATION_PAYLOAD_MISMATCH");
  return {status:"RECEIVED",stateVersion:version+1,updatedAt:new Date().toISOString(),
    verification:null,authorization:null,nodeLease:null,crankerLease:null,result:null};
}
