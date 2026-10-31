import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaymentIntentMessage,
  parsePaymentIntentMessage,
} from "../dist/canonical-message.js";
import { buildCreateIntentRequest } from "../dist/contracts.js";

test("payment authorization binds the recipient TIN without route data", () => {
  const message = buildPaymentIntentMessage({
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
    senderSignedFundingTransaction: "signed-transaction",
    senderFundingMode: "tcap_deposit_v2",
  });
  assert.equal(request.recipientHash, "ab".repeat(32));
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
      senderSignedFundingTransaction: "signed-transaction",
      senderFundingMode: "tcap_deposit_v2",
    }),
    /32-byte hexadecimal hash returned by TSN Node TIN resolution/,
  );
});
