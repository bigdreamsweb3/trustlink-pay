import type { ReceiverWork, PayloadDelta } from "../models";

/**
 * Read the existing legacy verifiedPayload or reconstruct compact evidence from its stored delta.
 * Input: the explicit typed parameters below. Output: Existing legacy object, reconstructed payload object or null.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Invalid stored iterable/object operations retain native error behavior.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function verifiedPayloadForWork(work: ReceiverWork): Record<string, unknown> | null {
  const verification = work.verification;
  if (!verification) return null;
  const legacy = verification.verifiedPayload;
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
    return legacy as Record<string, unknown>;
  }
  const delta = verification.payloadDelta as PayloadDelta | undefined;
  if (!delta || typeof delta !== "object") return null;
  const result: Record<string, unknown> = { ...work.payload };
  for (const key of delta.removedFields ?? []) delete result[key];
  Object.assign(result, delta.addedFields ?? {}, delta.changedFields ?? {});
  return result;
}
