import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaymentIntentMessage,
  parsePaymentIntentMessage,
} from "../dist/canonical-message.js";

test("payment authorization binds the recipient TIN without route data", () => {
  const message = buildPaymentIntentMessage({
    amountBaseUnits: 1_250_000n,
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
    recipientTin: "1234567890",
    feeBaseUnits: 0n,
    sender: "Main Wallet",
    nonce: "nonce-1",
    expires: "2030-01-01T00:00:00.000Z",
  });
  assert.doesNotMatch(message, /Recipient Route Commitment|Recipient Route Version/);
});
