import type { ReceiverWork } from "../models";
import { allowlistedEntry } from "./allowlisted-entry";
import { verifiedPayloadForWork } from "../verification/verified-payload-for-work";

/**
 * Select the existing public coordination fields from reconstructed verified data or durable payload.
 * Input: the explicit typed parameters below. Output: Public payload with private ingress/envelope fields omitted by its unchanged allowlist.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Stored-payload/native object-entry errors retain their current behavior.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function publicCoordinationPayload(work: ReceiverWork): Record<string, unknown> {
  const payload = verifiedPayloadForWork(work) ?? work.payload;
  const allowed = work.fundingPhase ? new Set(["paymentId"]) : new Set(["paymentId", "intentId", "recipientHash", "source", "tokenMintAddress", "amount"]);
  return Object.fromEntries(Object.entries(payload).filter(allowlistedEntry.bind(null, allowed)));
}
