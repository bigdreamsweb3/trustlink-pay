import type { Dependencies } from "./dependencies";
import type { ReceiverWork } from "../../work-contract";
import { assertFundingLineage } from "./assert-funding-lineage";
import { requeuePatch } from "./requeue-patch";
import { LEGACY_MEMO_INPUT_COUNT_REJECTION, FUNDED_ROOT_STALE } from "./configuration";

/** snapshotRetryPatch component. Inputs and results retain the original settlement-retry contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function snapshotRetryPatch(dependencies: Pick<Dependencies, "clock">, current: ReceiverWork, funding: ReceiverWork, expectedVersion: number, requestedBy: string) {
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
  return requeuePatch(dependencies, current, funding, requestedBy);
}
