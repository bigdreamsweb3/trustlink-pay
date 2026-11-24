/** Restricted sender-authorized debit ingress. Node validates identity, signatures and proof context. */
export function assertTinDebitIngress(payload: Record<string, unknown>): void {
  const fields = ["paymentId", "senderTin", "recipientTin", "tokenMintAddress", "amountBaseUnits", "nonce", "amountBlinding", "deploymentCommitment", "validAfterSlot", "expiresAtSlot", "approval", "senderOpening"];
  if (Object.keys(payload).length !== fields.length || fields.some(name => !(name in payload))) throw new Error("TIN_DEBIT_INGRESS_FIELDS_INVALID");
  if (typeof payload.paymentId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(payload.paymentId)
      || !/^\d{10}$/.test(String(payload.senderTin)) || !/^\d{10}$/.test(String(payload.recipientTin))
      || payload.senderTin === payload.recipientTin) throw new Error("TIN_DEBIT_INGRESS_IDENTITY_INVALID");
  for (const name of ["amountBaseUnits", "nonce", "amountBlinding", "validAfterSlot", "expiresAtSlot"]) {
    if (typeof payload[name] !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(payload[name] as string)) throw new Error("TIN_DEBIT_INGRESS_INTEGER_INVALID");
    const maximum = ["amountBaseUnits", "validAfterSlot", "expiresAtSlot"].includes(name) ? (1n << 64n) - 1n : 21888242871839275222246405745257275088548364400416034343698204186575808495616n;
    if (BigInt(payload[name] as string) > maximum || (["amountBaseUnits", "nonce", "amountBlinding"].includes(name) && payload[name] === "0")) throw new Error("TIN_DEBIT_INGRESS_INTEGER_INVALID");
  }
  if (typeof payload.deploymentCommitment !== "string" || !/^[0-9a-f]{64}$/.test(payload.deploymentCommitment)
      || typeof payload.tokenMintAddress !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(payload.tokenMintAddress)
      || !payload.approval || typeof payload.approval !== "object" || Array.isArray(payload.approval)
      || !payload.senderOpening || typeof payload.senderOpening !== "object" || Array.isArray(payload.senderOpening)) throw new Error("TIN_DEBIT_INGRESS_AUTHORIZATION_INVALID");
}
