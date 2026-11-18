import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaymentIntentMessage,
  parsePaymentIntentMessage,
} from "../dist/canonical-message.js";
import { assertSenderFundingBlockhashContext, buildCreateIntentRequest } from "../dist/contracts.js";
import { PublicKey } from "@solana/web3.js";
const blockhashContext = { blockhash: new PublicKey(new Uint8Array(32).fill(9)).toBase58(), lastValidBlockHeight: 200, contextSlot: 100 };
import { deriveFundingNoteCommitmentV1 } from "../dist/gpru/funding-note.js";
const fundingNote = { version: 1, secret: "01".padStart(64, "0"), blinding: "02".padStart(64, "0"),
  commitment: deriveFundingNoteCommitmentV1("01".padStart(64, "0"), "02".padStart(64, "0")) };

test("payment authorization binds the recipient TIN without route data", () => {
  const message = buildPaymentIntentMessage({
    fundingNoteCommitment: fundingNote.commitment,
    amountBaseUnits: 1_250_000n,
    tokenMintAddress: "11111111111111111111111111111111",
    tokenDecimals: 6,
    recipientTin: "1234567890",
    feeBaseUnits: 5_000n,
    sender: "Main Wallet",
    nonce: "nonce-1",
    expires: "2030-01-01T00:00:00.000Z",
  });
  const parsed = parsePaymentIntentMessage(message);

  assert.equal(parsed.recipientTin, "1234567890");
  assert.doesNotMatch(message, /Recipient Route Commitment|Recipient Route Version/);
});

test("payment authorization does not accept sender-supplied route data", () => {
  const message = buildPaymentIntentMessage({
    fundingNoteCommitment: fundingNote.commitment,
    amountBaseUnits: 1n,
    tokenMintAddress: "11111111111111111111111111111111",
    tokenDecimals: 6,
    recipientTin: "1234567890",
    feeBaseUnits: 0n,
    sender: "Main Wallet",
    nonce: "nonce-1",
    expires: "2030-01-01T00:00:00.000Z",
  });
  assert.doesNotMatch(message, /Recipient Route Commitment|Recipient Route Version/);
});

test("intent builder accepts only the Node-resolved 32-byte recipient owner hash", () => {
  const request = buildCreateIntentRequest({
    paymentId: "payment-1",
    recipientHash: "AB".repeat(32),
    recipientTin: "1234567890",
    tokenMintAddress: "mint",
    amount: 1,
    senderWallet: "wallet",
    senderAuthorizationMessage: "authorization",
    senderAuthorizationSignature: "signature",
    senderAuthorizationNonce: "nonce",
    senderFundingMode: "tcap_funded_note_v1", fundingNote,
  });
  assert.equal(request.recipientHash, "ab".repeat(32));
  assert.equal("senderSignedFundingTransaction" in request, false);
  assert.equal("senderFundingBlockhashContext" in request, false);
  assert.throws(() => buildCreateIntentRequest({ ...request, senderFundingBlockhashContext: blockhashContext }), /MESSAGE_AUTHORIZATION_ONLY/);
  assert.throws(() => buildCreateIntentRequest({ ...request, senderFundingDepositTxB64: "signed-wire" }), /MESSAGE_AUTHORIZATION_ONLY/);
  assert.throws(
    () => buildCreateIntentRequest({
      paymentId: "payment-1",
      recipientHash: "1234567890",
      recipientTin: "1234567890",
      tokenMintAddress: "mint",
      amount: 1,
      senderWallet: "wallet",
      senderAuthorizationMessage: "authorization",
      senderAuthorizationSignature: "signature",
      senderAuthorizationNonce: "nonce",
      senderFundingMode: "tcap_funded_note_v1", fundingNote,
    }),
    /32-byte hexadecimal hash returned by TSN Node TIN resolution/,
  );
});

test("funding blockhash context has exact keys, canonical hash and safe numeric boundaries", () => {
  const accepted = assertSenderFundingBlockhashContext(blockhashContext);
  assert.deepEqual(accepted, blockhashContext);
  assert.notEqual(accepted, blockhashContext);
  assert.equal(assertSenderFundingBlockhashContext({ ...blockhashContext, contextSlot: 0 }).contextSlot, 0);
  for (const value of [undefined, null, [], {}, { ...blockhashContext, extra: true },
    { ...blockhashContext, blockhash: "1" }, { ...blockhashContext, blockhash: "0".repeat(32) },
    { ...blockhashContext, blockhash: "11111111111111111111111111111111" }, { ...blockhashContext, blockhash: "z".repeat(44) },
    { ...blockhashContext, lastValidBlockHeight: 0 }, { ...blockhashContext, lastValidBlockHeight: "200" },
    { ...blockhashContext, lastValidBlockHeight: Number.MAX_SAFE_INTEGER + 1 },
    { ...blockhashContext, contextSlot: -1 }, { ...blockhashContext, contextSlot: 1.5 },
    { ...blockhashContext, contextSlot: NaN }, { ...blockhashContext, contextSlot: "100" }]) {
    assert.throws(() => assertSenderFundingBlockhashContext(value), /BLOCKHASH_CONTEXT_INVALID/);
  }
});
