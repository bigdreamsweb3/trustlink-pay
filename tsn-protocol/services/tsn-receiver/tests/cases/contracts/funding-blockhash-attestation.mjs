import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";

export function caseFundingBlockhashAttestation(assertNodeVerificationAttestation, createReceivedWork, crankerExecutionPayload, nodeCommitment, attestationMessage) {
  const keys = generateKeyPairSync("ed25519");
  const raw = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const dependencies = { clock: Date, environment: { TSN_NODE_VERIFICATION_PUBLIC_KEY: raw.toString("hex") } };
  const work = { ...createReceivedWork({ id: "synthetic-funding", kind: "AUTHORIZED_FUNDING", payload: { paymentId: "synthetic-payment" } }), status: "NODE_VERIFYING", stateVersion: 2, nodeLease: { owner: "synthetic-node", leaseId: "synthetic-lease", version: 2, expiresAt: "2099-01-01T00:00:00Z" } };
  const context = { blockhash: "11111111111111111111111111111112", lastValidBlockHeight: 150, contextSlot: 17 };
  const verifiedPayload = { senderSignedFundingTransaction: "synthetic-wire", senderFundingMode: "tcap_funded_note_v1", senderFundingBlockhashContext: context };
  const evidence = { verificationType: "TSN_AUTHORIZED_FUNDING", verifiedPayload };
  const attestation = { version: 1, algorithm: "Ed25519", workId: work.id, workKind: work.kind, decision: "VERIFIED", inputPayloadCommitment: work.payloadCommitment, evidenceCommitment: nodeCommitment(evidence), executionPayloadCommitment: nodeCommitment(crankerExecutionPayload(work.kind, verifiedPayload)), verificationType: evidence.verificationType, leaseId: work.nodeLease.leaseId, leaseVersion: 2, nodeId: work.nodeLease.owner, keyId: createHash("sha256").update(raw).digest("hex").slice(0, 24), signedAt: "2026-11-17T00:00:00Z" };
  attestation.signatureBase64 = sign(null, attestationMessage(attestation), keys.privateKey).toString("base64");
  const params = { work, owner: work.nodeLease.owner, expectedVersion: 2, status: "VERIFIED", evidence: { ...evidence, nodeAttestation: attestation } };
  assert.doesNotThrow(assertNodeVerificationAttestation.bind(null, dependencies, params));
  for (const field of ["blockhash", "lastValidBlockHeight", "contextSlot"]) {
    const changedContext = { ...context, [field]: field === "blockhash" ? "11111111111111111111111111111113" : context[field] + 1 };
    const changedEvidence = { ...evidence, verifiedPayload: { ...verifiedPayload, senderFundingBlockhashContext: changedContext } };
    const changedAttestation = { ...attestation, evidenceCommitment: nodeCommitment(changedEvidence) };
    changedAttestation.signatureBase64 = sign(null, attestationMessage(changedAttestation), keys.privateKey).toString("base64");
    assert.throws(assertNodeVerificationAttestation.bind(null, dependencies, { ...params, evidence: { ...changedEvidence, nodeAttestation: changedAttestation } }), /NODE_ATTESTATION_CONTEXT_MISMATCH/);
  }
}
