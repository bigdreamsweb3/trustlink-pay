import { attestationFieldValue } from "./attestation-field-value";
import { hasAttestationLineBreak } from "./has-attestation-line-break";
import { NodeAttestation, MESSAGE_FIELDS } from "./configuration";

/** attestationMessage component. Inputs and results retain the original node-verification contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function attestationMessage(attestation: NodeAttestation) {
  const values = MESSAGE_FIELDS.map(attestationFieldValue.bind(null, { attestation }));
  if (values.some(hasAttestationLineBreak)) {
    throw new Error("NODE_ATTESTATION_INVALID_FIELD");
  }
  return Buffer.from(`TSN_NODE_VERIFICATION_V1\n${values.join("\n")}`, "utf8");
}
