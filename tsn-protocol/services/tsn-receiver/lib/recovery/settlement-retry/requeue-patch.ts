import type { Dependencies } from "./dependencies";
import type { ReceiverWork } from "../../work-contract";

/** requeuePatch component. Inputs and results retain the original settlement-retry contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function requeuePatch(dependencies: Pick<Dependencies, "clock">, current: ReceiverWork, funding: ReceiverWork, requestedBy: string, reason?: string) {
  const retriedAt = new dependencies.clock().toISOString();
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
