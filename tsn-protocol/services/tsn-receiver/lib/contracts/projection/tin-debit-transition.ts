/** Exact public TIN-Debit statement shared by Node and Cranker. */
export function tinDebitTransition(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("TIN_DEBIT_TRANSITION_REQUIRED");
  const fields = new Set(["authority", "motherEscrow", "tcapProgram", "tsnProgram", "config", "assetEntry", "commitmentRoot", "reserveState", "authorizationSigner", "tipRouteRoot", "tinDebitVerifier", "instructions", "gpruProgram", "tipProgram", "proof", "memoPayloads", "authorizationDigest", "tokenId", "amountCommitment", "authorizationCommitment", "actionCommitment", "nullifier", "previousTcapRoot", "newTcapRoot", "tcapRootSequence", "validAfterSlot", "expiresAtSlot", "deploymentCommitment"]);
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some(name => !fields.has(name)) || Object.keys(source).length !== fields.size) throw new Error("TIN_DEBIT_EXECUTION_FIELD_SET_INVALID");
  const proof = source.proof as Record<string, unknown>;
  if (!proof || typeof proof !== "object" || Array.isArray(proof) || Object.keys(proof).sort().join("|") !== "proofA|proofB|proofC|publicInputs") throw new Error("TIN_DEBIT_EXECUTION_PROOF_FIELD_SET_INVALID");
  return { ...source, proof: { ...proof } };
}
