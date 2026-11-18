import type { ReceiverWork } from "../models";

/**
 * Translate a durable Receiver status to the existing public intent vocabulary.
 * Input: the explicit typed parameters below. Output: Pending/canceled/executed or existing lowercase status.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Native status conversion errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function publicIntentStatus(work: ReceiverWork): string {
  if (["RECEIVED", "NODE_VERIFYING", "FUNDING_READY", "VERIFIED", "CRANKER_LEASED"].includes(work.status)) return "pending";
  if (work.status === "REJECTED") return "canceled";
  if (work.status === "CONFIRMED") return "executed";
  return work.status.toLowerCase();
}
