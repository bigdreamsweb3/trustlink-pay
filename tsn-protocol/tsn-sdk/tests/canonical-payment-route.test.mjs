import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaymentIntentMessage,
  parsePaymentIntentMessage,
} from "../dist/canonical-message.js";

test("payment authorization binds the recipient route commitment and version", () => {
  const message = buildPaymentIntentMessage({
    amountBaseUnits: 1_250_000n,
    recipientTin: "1234567890",
    recipientRouteCommitment: "ab".repeat(32),
    recipientRouteVersion: 4,
    feeBaseUnits: 5_000n,
    sender: "Main Wallet",
    nonce: "nonce-1",
    expires: "2030-01-01T00:00:00.000Z",
  });
  const parsed = parsePaymentIntentMessage(message);

  assert.equal(parsed.recipientRouteCommitment, "ab".repeat(32));
  assert.equal(parsed.recipientRouteVersion, 4);
});

test("payment authorization rejects an invalid recipient route commitment", () => {
  assert.throws(() => buildPaymentIntentMessage({
    amountBaseUnits: 1n,
    recipientTin: "1234567890",
    recipientRouteCommitment: "not-a-commitment",
    recipientRouteVersion: 1,
    feeBaseUnits: 0n,
    sender: "Main Wallet",
    nonce: "nonce-1",
    expires: "2030-01-01T00:00:00.000Z",
  }), /Recipient Route Commitment/);
});
