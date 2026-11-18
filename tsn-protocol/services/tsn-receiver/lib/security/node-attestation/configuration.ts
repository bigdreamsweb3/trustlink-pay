

export type NodeAttestation = {
  version?: number;
  algorithm?: string;
  workId?: string;
  workKind?: string;
  decision?: string;
  inputPayloadCommitment?: string;
  evidenceCommitment?: string;
  executionPayloadCommitment?: string;
  verificationType?: string;
  leaseId?: string;
  leaseVersion?: number;
  nodeId?: string;
  keyId?: string;
  signedAt?: string;
  signatureBase64?: string;
};
export const MESSAGE_FIELDS = [
  "version", "workId", "workKind", "decision", "inputPayloadCommitment",
  "evidenceCommitment", "executionPayloadCommitment", "verificationType", "leaseId", "leaseVersion",
  "nodeId", "keyId", "signedAt",
] as const;
