import { payloadCommitment } from "../../work-contract";
import type { ReceiverWork } from "../../work-contract";

/** receiptContextCommitment component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function receiptContextCommitment(work: ReceiverWork, lateReport: boolean) {
  if (!lateReport) return payloadCommitment(work);
  // Expiry reclamation may change only these coordination fields while RPC runs.
  // Authorization, signed wire identity, funding and all other context stay exact.
  const context = { ...work } as Record<string, unknown>;
  for (const key of ["status", "stateVersion", "updatedAt", "crankerLease"]) delete context[key];
  return payloadCommitment(context);
}
