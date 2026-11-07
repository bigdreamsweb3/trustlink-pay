import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptPayloadForNode, encryptPayloadForNode } from "../lib/node-envelope.ts";

test("payment secrets are encrypted and only the Node envelope can recover them", () => {
  const previous = process.env.TSN_RECEIVER_NODE_PAYLOAD_KEY;
  process.env.TSN_RECEIVER_NODE_PAYLOAD_KEY = "11".repeat(32);
  try {
    const payload = { recipientTin: "123456", senderAuthorizationSignature: "sig", senderSignedFundingTransaction: "tx",
      fundingNote: { version: 1, secret: "00".repeat(31) + "01", blinding: "00".repeat(31) + "02", commitment: "00".repeat(31) + "03" } };
    const envelope = encryptPayloadForNode(payload);
    assert.notEqual(envelope.ciphertext, JSON.stringify(payload));
    assert.deepEqual(decryptPayloadForNode(envelope), payload);
  } finally {
    if (previous === undefined) delete process.env.TSN_RECEIVER_NODE_PAYLOAD_KEY;
    else process.env.TSN_RECEIVER_NODE_PAYLOAD_KEY = previous;
  }
});
