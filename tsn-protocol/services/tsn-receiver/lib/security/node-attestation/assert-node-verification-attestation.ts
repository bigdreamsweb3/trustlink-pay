import type { Dependencies } from "./dependencies";
import { createHash } from "node:crypto";
import { verify } from "node:crypto";
import { crankerExecutionPayload } from "../../work-contract";
import type { ReceiverWork } from "../../work-contract";
import type { WorkStatus } from "../../work-contract";
import { configuredPublicKey } from "./configured-public-key";
import { nodeCommitment } from "./node-commitment";
import { attestationMessage } from "./attestation-message";
import { NodeAttestation } from "./configuration";

/** assertNodeVerificationAttestation component. Inputs and results retain the original node-verification contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function assertNodeVerificationAttestation(dependencies: Pick<Dependencies, "clock" | "environment">, params: {
  work: ReceiverWork;
  owner: string;
  expectedVersion: number;
  status: WorkStatus;
  evidence: Record<string, unknown> | undefined;
}) {
  const evidence = params.evidence;
  const attestation = evidence?.nodeAttestation as NodeAttestation | undefined;
  if (!evidence || !attestation || typeof attestation !== "object") {
    throw new Error("NODE_ATTESTATION_REQUIRED");
  }
  if (params.status === "VERIFIED" && (!evidence.verifiedPayload || typeof evidence.verifiedPayload !== "object" || Array.isArray(evidence.verifiedPayload) || !String(evidence.verificationType ?? "").trim())) {
    throw new Error("NODE_VERIFIED_EVIDENCE_REQUIRED");
  }
  const lease = params.work.nodeLease;
  if (!lease) throw new Error("NODE_ATTESTATION_LEASE_MISSING");
  const { raw, key } = configuredPublicKey(dependencies);
  const expectedKeyId = createHash("sha256").update(raw).digest("hex").slice(0, 24);
  const unsignedEvidence = { ...evidence };
  delete unsignedEvidence.nodeAttestation;
  const expectedEvidenceCommitment = nodeCommitment(unsignedEvidence);
  const verifiedPayload = evidence.verifiedPayload;
  const executionPayload = params.status === "VERIFIED" && verifiedPayload && typeof verifiedPayload === "object" && !Array.isArray(verifiedPayload)
    ? crankerExecutionPayload(params.work.kind, verifiedPayload as Record<string, unknown>)
    : {};
  const expectedExecutionPayloadCommitment = nodeCommitment(executionPayload);
  if (
    attestation.version !== 1
    || attestation.algorithm !== "Ed25519"
    || attestation.workId !== params.work.id
    || attestation.workKind !== params.work.kind
    || attestation.decision !== params.status
    || attestation.inputPayloadCommitment !== params.work.payloadCommitment
    || attestation.evidenceCommitment !== expectedEvidenceCommitment
    || attestation.executionPayloadCommitment !== expectedExecutionPayloadCommitment
    || attestation.leaseId !== (lease.leaseId ?? params.work.id)
    || Number(attestation.leaseVersion) !== Number(lease.version ?? params.expectedVersion)
    || attestation.nodeId !== params.owner
    || attestation.keyId !== expectedKeyId
    || (["VERIFIED", "FUNDING_READY"].includes(params.status) && attestation.verificationType !== String(evidence.verificationType ?? ""))
    || !attestation.signedAt
    || !Number.isFinite(dependencies.clock.parse(attestation.signedAt))
  ) {
    throw new Error("NODE_ATTESTATION_CONTEXT_MISMATCH");
  }
  const signature = Buffer.from(String(attestation.signatureBase64 ?? ""), "base64");
  if (
    signature.length !== 64
    || signature.toString("base64").replace(/=+$/, "") !== String(attestation.signatureBase64).replace(/=+$/, "")
    || !verify(null, attestationMessage(attestation), key, signature)
  ) {
    throw new Error("NODE_ATTESTATION_SIGNATURE_INVALID");
  }
}
