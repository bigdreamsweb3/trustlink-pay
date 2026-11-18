import type { Dependencies } from "./dependencies";
import { payloadCommitment } from "../../work-contract";
import type { ReceiverWork } from "../../work-contract";
import { NATIVE_REVERIFY_REASONS } from "../../settlement-retry";
import { fundedRootRetryPatch } from "../../settlement-retry";

/** nativeWorkRetryPatch component. Inputs and results retain the original native-work-retry contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function nativeWorkRetryPatch(dependencies: Pick<Dependencies, "clock">, current: ReceiverWork, funding: ReceiverWork | null,
    version: number, owner: string, requestedBy: string, reason: string) {
  if (!NATIVE_REVERIFY_REASONS.has(reason)) throw new Error("SETTLEMENT_RETRY_REASON_NOT_ALLOWED");
  if (current.kind === "SETTLEMENT") {
    if (!funding) throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
    return fundedRootRetryPatch(current, funding, version, owner, requestedBy, reason);
  }
  if (!["TCAP_EPOCH_ACCOUNTING"].includes(current.kind)) throw new Error("SETTLEMENT_RETRY_MODE_NOT_ALLOWED");
  if (!Number.isSafeInteger(version) || current.stateVersion !== version) throw new Error("STALE_STATE_VERSION");
  if (current.status !== "CRANKER_LEASED" || current.crankerLease?.owner !== owner
      || !Number.isFinite(dependencies.clock.parse(current.crankerLease.expiresAt)) || dependencies.clock.parse(current.crankerLease.expiresAt) <= dependencies.clock.now()) throw new Error("SETTLEMENT_RETRY_LEASE_INVALID");
  if (current.nodeLease || (current.result && Object.keys(current.result).length)) throw new Error("SETTLEMENT_RETRY_HAS_EXECUTION_STATE");
  if (payloadCommitment(current.payload) !== current.payloadCommitment) throw new Error("PRIVATE_COORDINATION_PAYLOAD_MISMATCH");
  return {status:"RECEIVED",stateVersion:version+1,updatedAt:new dependencies.clock().toISOString(),
    verification:null,authorization:null,nodeLease:null,crankerLease:null,result:null,
    retryHistory:[...(current.retryHistory ?? []),{rejectedStateVersion:version,reason,
      retriedAt:new dependencies.clock().toISOString(),requestedBy,previousStatus:current.status}]};
}
