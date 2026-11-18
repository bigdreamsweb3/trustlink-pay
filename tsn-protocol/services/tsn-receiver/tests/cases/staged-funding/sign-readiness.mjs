import { createHash, sign } from "node:crypto";

/** Sign the actual readiness evidence with a synthetic Node key and an empty execution projection. */
export function signReadiness(context, work, changes = {}) {
  const evidence = { verificationType: "TSN_FUNDING_AUTHORIZATION_READY",
    fundingReadiness: { expiresAt: new Date(Date.now() + 300000).toISOString(), authorizationPayloadCommitment: work.authorizationPayloadCommitment },
    receiverLease: { source: "tsn-receiver", workId: work.id, kind: work.kind, stateVersion: work.stateVersion, payloadCommitment: work.payloadCommitment },
    authorizationPreflight: { authorizationVerified: true, sourceBalanceBaseUnits: "private-1000000", privateRecipientRoute: "private-route" }, ...changes };
  const attestation = { version: 1, algorithm: "Ed25519", workId: work.id, workKind: work.kind, decision: "FUNDING_READY",
    inputPayloadCommitment: work.payloadCommitment, evidenceCommitment: context.nodeCommitment(evidence),
    executionPayloadCommitment: context.nodeCommitment({}), verificationType: evidence.verificationType,
    leaseId: work.nodeLease.leaseId, leaseVersion: work.nodeLease.version, nodeId: work.nodeLease.owner,
    keyId: createHash("sha256").update(context.nodePublic).digest("hex").slice(0, 24), signedAt: new Date().toISOString() };
  attestation.signatureBase64 = sign(null, context.attestationMessage(attestation), context.nodeKeys.privateKey).toString("base64");
  return { ...evidence, nodeAttestation: attestation };
}
