import assert from "node:assert/strict";

export function caseFundingBlockhashValidation(validate, crankerExecutionPayload) {
  const valid = { blockhash: "11111111111111111111111111111112", lastValidBlockHeight: 150, contextSlot: 0 };
  assert.doesNotThrow(validate.bind(null, valid));
  assert.doesNotThrow(validate.bind(null, { ...valid, contextSlot: Number.MAX_SAFE_INTEGER, lastValidBlockHeight: Number.MAX_SAFE_INTEGER }));
  for (const value of [undefined, null, [], "context", 1]) {
    assert.throws(validate.bind(null, value), /SENDER_FUNDING_BLOCKHASH_CONTEXT_REQUIRED/);
  }
  for (const value of [
    {}, { ...valid, blockhash: " " + valid.blockhash }, { ...valid, blockhash: "0".repeat(32) },
    { ...valid, blockhash: "1".repeat(31) }, { ...valid, blockhash: "1".repeat(32) }, { ...valid, blockhash: "z".repeat(44) },
    { ...valid, blockhash: 1 }, { ...valid, lastValidBlockHeight: "150" },
    { ...valid, lastValidBlockHeight: 0 }, { ...valid, lastValidBlockHeight: -1 },
    { ...valid, lastValidBlockHeight: 1.5 }, { ...valid, lastValidBlockHeight: Infinity },
    { ...valid, lastValidBlockHeight: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, contextSlot: "0" }, { ...valid, contextSlot: -1 }, { ...valid, contextSlot: 0.5 },
    { ...valid, contextSlot: NaN }, { ...valid, contextSlot: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.throws(validate.bind(null, value), /SENDER_FUNDING_BLOCKHASH_CONTEXT_INVALID/);
  assert.throws(validate.bind(null, { ...valid, provider: "private-url" }), /UNSUPPORTED_PAYLOAD_FIELD:senderFundingBlockhashContext.provider/);
  assert.throws(crankerExecutionPayload.bind(null, "AUTHORIZED_FUNDING", { senderSignedFundingTransaction: "old-wire", senderFundingMode: "tcap_funded_note_v1" }), /SENDER_FUNDING_BLOCKHASH_CONTEXT_REQUIRED/);
  assert.throws(crankerExecutionPayload.bind(null, "AUTHORIZED_FUNDING", { senderFundingBlockhashContext: { ...valid, secret: "forbidden" } }), /UNSUPPORTED_PAYLOAD_FIELD/);
  assert.deepEqual(crankerExecutionPayload("SETTLEMENT", {}), {});
}
