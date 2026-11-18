import { createHash, sign } from "node:crypto";

/** Synthetic final verification binds the exact existing funding execution projection. */
export function signFundingVerification(context, work) {
  const evidence = { verificationType: "TSN_AUTHORIZED_FUNDING", verifiedPayload: work.payload, programSimulation: "PASSED" };
  const attestation = { version: 1, algorithm: "Ed25519", workId: work.id, workKind: work.kind, decision: "VERIFIED",
    inputPayloadCommitment: work.payloadCommitment, evidenceCommitment: context.nodeCommitment(evidence),
    executionPayloadCommitment: context.nodeCommitment(context.contract.crankerExecutionPayload(work.kind, work.payload)),
    verificationType: evidence.verificationType, leaseId: work.nodeLease.leaseId, leaseVersion: work.nodeLease.version,
    nodeId: work.nodeLease.owner, keyId: createHash("sha256").update(context.nodePublic).digest("hex").slice(0, 24),
    signedAt: new Date().toISOString() };
  attestation.signatureBase64 = sign(null, context.attestationMessage(attestation), context.nodeKeys.privateKey).toString("base64");
  return { ...evidence, nodeAttestation: attestation };
}
