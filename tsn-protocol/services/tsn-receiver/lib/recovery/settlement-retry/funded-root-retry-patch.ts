import type { Dependencies } from "./dependencies";
import { verifiedPayloadForWork } from "../../work-contract";
import type { ReceiverWork } from "../../work-contract";
import { assertFundingLineage } from "./assert-funding-lineage";
import { requeuePatch } from "./requeue-patch";
import { FUNDED_ROOT_STALE, NATIVE_REVERIFY_REASONS } from "./configuration";

/** fundedRootRetryPatch component. Inputs and results retain the original settlement-retry contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function fundedRootRetryPatch(dependencies: Pick<Dependencies, "clock">, current: ReceiverWork, funding: ReceiverWork, expectedVersion: number, owner: string, requestedBy: string, reason = FUNDED_ROOT_STALE) {
  if (!Number.isSafeInteger(expectedVersion) || current.stateVersion !== expectedVersion) throw new Error("STALE_STATE_VERSION");
  const lease = current.crankerLease;
  if (current.kind !== "SETTLEMENT" || current.status !== "CRANKER_LEASED" || !lease
      || lease.owner !== owner || !Number.isFinite(dependencies.clock.parse(lease.expiresAt)) || dependencies.clock.parse(lease.expiresAt) <= dependencies.clock.now()) {
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
  if (!NATIVE_REVERIFY_REASONS.has(reason)) throw new Error("SETTLEMENT_RETRY_REASON_NOT_ALLOWED");
  return requeuePatch(dependencies, current, funding, requestedBy, reason);
}
