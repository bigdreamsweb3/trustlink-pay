import { diffPayload } from "./diff-payload";

/**
 * Replace a valid verifiedPayload object with differences from the original payload; preserve other evidence.
 * Input: the explicit typed parameters below. Output: Compact decision, or the original evidence/default when no valid verifiedPayload exists.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Canonical serialization errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function compactVerificationPayload(
  payload: Record<string, unknown>,
  verification: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const verified = verification?.verifiedPayload;
  if (!verified || typeof verified !== "object" || Array.isArray(verified)) return verification ?? {};
  const { verifiedPayload: _verifiedPayload, ...decision } = verification;
  return {
    ...decision,
    payloadDelta: diffPayload(payload, verified as Record<string, unknown>),
  };
}
