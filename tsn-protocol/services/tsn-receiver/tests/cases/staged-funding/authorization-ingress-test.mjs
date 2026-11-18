import assert from "node:assert/strict";
import { createAuthorization } from "./create-authorization.mjs";

/** Initial ingress permits the existing owner authorization and rejects premature deposit material. */
export function authorizationIngressTest(fixture) {
  const payload = createAuthorization();
  const validate = fixture.contract.assertPaymentAuthorizationIngress;
  assert.doesNotThrow(validate.bind(null, payload));
  for (const change of [
    { senderSignedFundingTransaction: "premature-wire" },
    { senderFundingBlockhashContext: { blockhash: "11111111111111111111111111111112", lastValidBlockHeight: 150, contextSlot: 17 } },
    { senderSignedFundingTransaction: undefined }, { senderFundingBlockhashContext: undefined },
  ]) assert.throws(validate.bind(null, { ...payload, ...change }), /UNSUPPORTED_PAYLOAD_FIELD/);
  assert.throws(validate.bind(null, { ...payload, senderAuthorizationMessage: "replaced message" }), /INVALID_SENDER_SIGNATURE/);
  assert.throws(validate.bind(null, { ...payload, fundingNote: { ...payload.fundingNote, secret: "00".repeat(32) } }), /INVALID_FUNDED_NOTE_PRIVATE_OPENING/);
  assert.throws(fixture.contract.assertAuthorizedFundingIngress.bind(null, payload), /OWNER_SIGNED_TCAP_DEPOSIT_REQUIRED/);
}
