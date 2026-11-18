import { NodeAttestation } from "./configuration";

/** attestationFieldValue component. Inputs and results retain the original node-verification contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function attestationFieldValue(context: { attestation: NodeAttestation }, field: "version" | "workId" | "workKind" | "decision" | "inputPayloadCommitment" | "evidenceCommitment" | "executionPayloadCommitment" | "verificationType" | "leaseId" | "leaseVersion" | "nodeId" | "keyId" | "signedAt") {
const { attestation } = context;
return String(attestation[field] ?? "");
}
