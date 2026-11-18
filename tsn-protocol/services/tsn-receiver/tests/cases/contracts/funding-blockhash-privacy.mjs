import assert from "node:assert/strict";

export function caseFundingBlockhashPrivacy(createReceivedWork, publicCoordinationPayload, compactAuthorizedFundingVerification, compactVerificationPayload, verifiedPayloadForWork, paymentReceiptVerification, encryptPayloadForNode, decryptPayloadForNode) {
  const context = { blockhash: "11111111111111111111111111111112", lastValidBlockHeight: 150, contextSlot: 17 };
  const ingress = { paymentId: "synthetic-payment", senderFundingBlockhashContext: context, senderSignedFundingTransaction: "synthetic-wire", senderFundingMode: "tcap_funded_note_v1" };
  const envelopeDependencies = { environment: { TSN_RECEIVER_NODE_PAYLOAD_KEY: "23".repeat(32) } };
  const envelope = encryptPayloadForNode(envelopeDependencies, ingress);
  const work = createReceivedWork({ id: "synthetic-funding", kind: "AUTHORIZED_FUNDING", payload: { paymentId: ingress.paymentId, recipientHash: "synthetic-recipient", nodeEncryptedPayload: envelope } });
  assert.deepEqual(decryptPayloadForNode(envelopeDependencies, envelope), ingress);
  assert.equal(Object.hasOwn(work.payload, "senderFundingBlockhashContext"), false);
  assert.doesNotMatch(JSON.stringify(work.payload), /senderFundingBlockhashContext|synthetic-wire/);
  assert.throws(createReceivedWork.bind(null, { kind: "AUTHORIZED_FUNDING", payload: { paymentId: ingress.paymentId, senderFundingBlockhashContext: context } }), /UNSUPPORTED_PAYLOAD_FIELD/);
  const verification = compactAuthorizedFundingVerification(work.payload, { verificationType: "TSN_AUTHORIZED_FUNDING", verifiedPayload: ingress });
  const verified = { ...work, status: "VERIFIED", verification };
  assert.deepEqual(verifiedPayloadForWork(verified).senderFundingBlockhashContext, context);
  assert.deepEqual(publicCoordinationPayload(verified), { paymentId: ingress.paymentId });
  const receipt = paymentReceiptVerification({ compactVerificationPayload, verifiedPayloadForWork }, verified);
  const confirmed = { ...verified, status: "CONFIRMED", verification: receipt, result: { signature: "synthetic-confirmed-funding" } };
  assert.equal(Object.hasOwn(verifiedPayloadForWork(confirmed), "senderFundingBlockhashContext"), false);
  assert.equal(Object.hasOwn(verifiedPayloadForWork(confirmed), "senderSignedFundingTransaction"), false);
  assert.deepEqual(confirmed.result, { signature: "synthetic-confirmed-funding" });
}
