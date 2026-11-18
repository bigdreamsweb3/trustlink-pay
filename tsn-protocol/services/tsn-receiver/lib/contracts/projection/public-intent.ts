import type { ReceiverWork } from "../models";
import { publicCoordinationPayload } from "./public-coordination-payload";
import { publicIntentStatus } from "./public-intent-status";
import { publicFundingReadiness } from "./public-funding-readiness";

/**
 * Project public work metadata and preserve the original final result-field override order.
 * Input: the explicit typed parameters below. Output: Existing public intent response shape.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Projection and native status errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function publicIntent(work: ReceiverWork) {
  return { ...publicCoordinationPayload(work), id: work.id, status: publicIntentStatus(work), postedAt: work.receivedAt, updatedAt: work.updatedAt, receiverStatus: work.status, receiverStateVersion: work.stateVersion, ...(work.result ?? {}), ...publicFundingReadiness(work) };
}
