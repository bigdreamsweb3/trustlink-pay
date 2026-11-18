import { compactVerificationPayload } from "./compact-verification-payload";
import { hasDefinedVerifiedField } from "./has-defined-verified-field";
import { verifiedFieldEntry } from "./verified-field-entry";

/**
 * Retain the existing public funding evidence and execution fields before compacting against durable payload.
 * Input: the explicit typed parameters below. Output: Restricted funding decision with its existing optional evidence fields and payloadDelta.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Canonical serialization errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function compactAuthorizedFundingVerification(
  payload: Record<string, unknown>,
  evidence: Record<string, unknown>,
): Record<string, unknown> {
  const verified = evidence.verifiedPayload;
  const verifiedPayload = verified && typeof verified === "object" && !Array.isArray(verified)
    ? Object.fromEntries(
        ["paymentId", "recipientHash", "tokenMintAddress", "amount", "senderSignedFundingTransaction", "senderFundingMode", "senderFundingBlockhashContext"]
          .filter(hasDefinedVerifiedField.bind(null, verified as Record<string, unknown>))
          .map(verifiedFieldEntry.bind(null, verified as Record<string, unknown>)),
      )
    : {};
  return compactVerificationPayload(payload, {
    ...(evidence.verificationType !== undefined ? { verificationType: evidence.verificationType } : {}),
    ...(evidence.nodeAttestation !== undefined ? { nodeAttestation: evidence.nodeAttestation } : {}),
    ...(evidence.programSimulation !== undefined ? { programSimulation: evidence.programSimulation } : {}),
    verifiedPayload,
  });
}
