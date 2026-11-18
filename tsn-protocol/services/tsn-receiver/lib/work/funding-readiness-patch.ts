import type { ReceiverWork } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { assertAllowlisted } from "../contracts/validation/assert-allowlisted";

/** Validate a signed authorization-only decision and retain its private preflight inside the existing envelope. */
export function fundingReadinessPatch(dependencies: Pick<WorkDependencies, "encryptPayloadForNode">, current: ReceiverWork, evidence: Record<string, unknown> | undefined) {
  if (current.kind !== "AUTHORIZED_FUNDING" || current.fundingPhase !== "AUTHORIZATION"
      || !current.authorizationPayloadCommitment || current.payloadCommitment !== current.authorizationPayloadCommitment) {
    throw new Error("FUNDING_READINESS_PHASE_INVALID");
  }
  if (!evidence || evidence.verificationType !== "TSN_FUNDING_AUTHORIZATION_READY") throw new Error("FUNDING_READINESS_EVIDENCE_REQUIRED");
  assertAllowlisted(evidence, new Set(["verificationType", "fundingReadiness", "authorizationPreflight", "receiverLease", "nodeAttestation"]), "fundingReadinessEvidence");
  const readiness = evidence.fundingReadiness;
  const preflight = evidence.authorizationPreflight;
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)
      || !preflight || typeof preflight !== "object" || Array.isArray(preflight) || !Object.keys(preflight).length) {
    throw new Error("FUNDING_READINESS_EVIDENCE_REQUIRED");
  }
  const metadata = readiness as Record<string, unknown>;
  assertAllowlisted(metadata, new Set(["expiresAt", "authorizationPayloadCommitment"]), "fundingReadiness");
  if (metadata.authorizationPayloadCommitment !== current.authorizationPayloadCommitment) throw new Error("FUNDING_AUTHORIZATION_COMMITMENT_MISMATCH");
  if (typeof metadata.expiresAt !== "string" || !Number.isFinite(Date.parse(metadata.expiresAt))) throw new Error("FUNDING_READINESS_EXPIRY_INVALID");
  if (Date.parse(metadata.expiresAt) <= Date.now()) throw new Error("FUNDING_READINESS_EXPIRED");
  const receiverLease = evidence.receiverLease;
  if (!receiverLease || typeof receiverLease !== "object" || Array.isArray(receiverLease)) throw new Error("FUNDING_READINESS_LEASE_REQUIRED");
  const lease = receiverLease as Record<string, unknown>;
  assertAllowlisted(lease, new Set(["source", "workId", "kind", "stateVersion", "payloadCommitment"]), "fundingReadinessLease");
  if (lease.source !== "tsn-receiver" || lease.workId !== current.id || lease.kind !== current.kind
      || lease.stateVersion !== current.stateVersion || lease.payloadCommitment !== current.payloadCommitment) throw new Error("FUNDING_READINESS_LEASE_MISMATCH");
  const fundingReadiness = {
    expiresAt: metadata.expiresAt,
    authorizationPayloadCommitment: current.authorizationPayloadCommitment,
    nodeEncryptedPreflight: dependencies.encryptPayloadForNode(preflight as Record<string, unknown>),
  };
  return {
    fundingReadiness,
    fundingReadinessAttestation: evidence.nodeAttestation as Record<string, unknown>,
    fundingReadinessReceiverLease: lease,
    verification: { verificationType: evidence.verificationType, nodeAttestation: evidence.nodeAttestation, fundingReadiness: { expiresAt: fundingReadiness.expiresAt, authorizationPayloadCommitment: fundingReadiness.authorizationPayloadCommitment } },
  };
}
