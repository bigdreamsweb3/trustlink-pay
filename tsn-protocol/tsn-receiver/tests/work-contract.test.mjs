import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { assertExternalWorkKind, assertAuthorizedFundingIngress, createReceivedWork, publicCoordinationPayload } from "../lib/work-contract.ts";

function base58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let output = "";
  while (number) { const remainder = Number(number % 58n); output = alphabet[remainder] + output; number /= 58n; }
  for (const byte of bytes) { if (byte === 0) output = `1${output}`; else break; }
  return output;
}

test("receiver accepts only public work and creates monotonic initial state", () => {
  const work = createReceivedWork({
    id: "intent-1",
    kind: "AUTHORIZED_FUNDING",
    payload: { paymentId: "p", recipientHash: "h", privacyVersion: 2 },
  });
  assert.equal(work.status, "RECEIVED");
  assert.equal(work.stateVersion, 1);
  assert.match(work.payloadCommitment, /^[a-f0-9]{64}$/);
});

test("receiver rejects fields outside the durable allowlist, regardless of their name", () => {
  assert.throws(() => createReceivedWork({
    kind: "AUTHORIZED_FUNDING",
    payload: { paymentId: "p", totallyDifferentSecret: "unsafe" },
  }), /UNSUPPORTED_PAYLOAD_FIELD/);
  assert.throws(() => createReceivedWork({
    kind: "SETTLEMENT",
    payload: { master_seed: "unsafe" },
  }), /UNSUPPORTED_PAYLOAD_FIELD/);
});

test("canonical commitment is independent of object insertion order", () => {
  const first = createReceivedWork({ kind: "SETTLEMENT", payload: { paymentId: "p", intentId: "i", recipientHash: "h", source: "test" } });
  const second = createReceivedWork({ kind: "SETTLEMENT", payload: { source: "test", recipientHash: "h", intentId: "i", paymentId: "p" } });
  assert.equal(first.payloadCommitment, second.payloadCommitment);
});

test("coordination views never include the encrypted envelope", () => {
  const work = createReceivedWork({ kind: "AUTHORIZED_FUNDING", payload: { paymentId: "p", recipientHash: "h", nodeEncryptedPayload: { version: 1, iv: "i", ciphertext: "c", tag: "t" } } });
  assert.deepEqual(publicCoordinationPayload(work), { paymentId: "p", recipientHash: "h" });
});

test("payment ingress requires a valid sender Ed25519 authorization", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  const wallet = base58(der.subarray(-32));
  const message = "TSN payment authorization";
  const payload = { paymentId: "p", recipientHash: "h", recipientRouteCommitment: "c", recipientRouteVersion: 1, tokenMintAddress: "m", amount: 1, senderWallet: wallet, senderAuthorizationMessage: message, senderAuthorizationSignature: sign(null, Buffer.from(message), privateKey).toString("base64"), senderAuthorizationNonce: "n" };
  assert.doesNotThrow(() => assertAuthorizedFundingIngress(payload));
  assert.throws(() => assertAuthorizedFundingIngress({ ...payload, senderAuthorizationSignature: Buffer.alloc(64).toString("base64") }), /INVALID_SENDER_SIGNATURE/);
});

test("public Receiver ingress cannot create settlement or recovery work", () => {
  assert.throws(() => assertExternalWorkKind("SETTLEMENT"), /SETTLEMENT_WORK_INTERNAL_ONLY/);
  assert.doesNotThrow(() => assertExternalWorkKind("AUTHORIZED_FUNDING"));
});
