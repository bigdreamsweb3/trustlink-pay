import assert from "node:assert/strict";
import { test } from "node:test";
import { createReceivedWork } from "../lib/work-contract.ts";

test("receiver accepts only public work and creates monotonic initial state", () => {
  const work = createReceivedWork({
    id: "intent-1",
    kind: "PAYMENT_INTENT",
    payload: { senderWallet: "public", signature: "public-signature" },
  });
  assert.equal(work.status, "RECEIVED");
  assert.equal(work.stateVersion, 1);
  assert.match(work.payloadCommitment, /^[a-f0-9]{64}$/);
});

test("receiver rejects secret-bearing nested fields", () => {
  assert.throws(() => createReceivedWork({
    kind: "PAYMENT_INTENT",
    payload: { nested: { secretKeyBase64: "unsafe" } },
  }), /FORBIDDEN_SECRET_FIELD/);
  assert.throws(() => createReceivedWork({
    kind: "CLAIM",
    payload: { master_seed: "unsafe" },
  }), /FORBIDDEN_SECRET_FIELD/);
});

test("canonical commitment is independent of object insertion order", () => {
  const first = createReceivedWork({ kind: "CLAIM", payload: { a: 1, b: 2 } });
  const second = createReceivedWork({ kind: "CLAIM", payload: { b: 2, a: 1 } });
  assert.equal(first.payloadCommitment, second.payloadCommitment);
});
