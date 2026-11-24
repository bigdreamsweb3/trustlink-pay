import type { ReceiverWork } from "../models";
import { hasResolvedNonExecution } from "./has-resolved-non-execution";

/** Allow a new debit only after rejection before execution or exact finalized nonexecution recovery. */
export function canReplaceTinDebit(work: ReceiverWork): boolean {
  if (work.kind !== "TIN_DEBIT" || work.payload.paymentId !== work.id || work.nodeLease || work.crankerLease) return false;
  if (work.status === "FAILED") return hasResolvedNonExecution(work);
  return work.status === "REJECTED"
    && (!work.authorization || Object.keys(work.authorization).length === 0)
    && (!work.result || Object.keys(work.result).length === 0)
    && !work.retryHistory?.length && !work.nonExecutionHistory?.length && !work.nonExecutionResolution;
}
