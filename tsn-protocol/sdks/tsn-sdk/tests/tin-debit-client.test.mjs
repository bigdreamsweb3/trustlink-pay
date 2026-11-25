import assert from "node:assert/strict";
import test from "node:test";
import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";
import { sendTinDebitV1 } from "../dist/tin-debit.js";
import { buildTinDebitPreparationMessage, isCanonicalTsnMessage } from "../dist/canonical-message.js";

const key = Keypair.fromSeed(new Uint8Array(32).fill(71));
const request = { paymentId: "same-debit", senderTin: "1234567890", recipientTin: "2345678901", amountBaseUnits: "30", nonce: "79" };
const intent = JSON.stringify([request.paymentId, key.publicKey.toBase58(), request.senderTin, request.recipientTin, "11111111111111111111111111111111", "0.00003"]);
const params = () => ({ paymentId: request.paymentId, tin: request.senderTin, recipientTin: request.recipientTin,
  tokenMintAddress: "11111111111111111111111111111111", amount: "0.00003", connection: {},
  ownerWallet: { publicKey: key.publicKey, signMessage: async () => assert.fail("Retry must not request another signature") },
  retryState: { intent, requestJson: JSON.stringify(request) } });

test("lost-response retries retain the exact private request, and conflicting intents never submit", async () => {
  const p = params(), bodies = [];
  p.debitClient = { post: async (path, body) => { assert.equal(path, "/network/tin-debit"); bodies.push(JSON.stringify(body)); if (bodies.length === 1) throw new Error("lost response"); return { workId: request.paymentId, status: "RECEIVED", stateVersion: 1 }; } };
  await assert.rejects(sendTinDebitV1(p), /lost response/);
  assert.equal(p.retryState.requestJson, JSON.stringify(request));
  assert.equal((await sendTinDebitV1(p)).workId, request.paymentId);
  assert.deepEqual(bodies, [JSON.stringify(request), JSON.stringify(request)]);
  await assert.rejects(sendTinDebitV1({ ...p, amount: "0.00004" }), /pending/);
  assert.equal(bodies.length, 2);
});

test("concurrent retry calls cannot start a second submission and cancellation retains recovery identity", async () => {
  const p = params(); let resolve;
  p.debitClient = { post: async () => new Promise(done => { resolve = done; }) };
  const first = sendTinDebitV1(p);
  await assert.rejects(sendTinDebitV1(p), /already/);
  resolve({ workId: request.paymentId, status: "RECEIVED", stateVersion: 1 }); await first;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(sendTinDebitV1({ ...p, signal: controller.signal }), { name: "AbortError" });
  assert.equal(p.retryState.requestJson, JSON.stringify(request));
});

test("preparation consent binds both TINs, mint and expiry and verifies the wallet before transport", async () => {
  const p = params(); p.retryState = {}; let calls = 0, signatures = 0;
  p.ownerWallet.signMessage = async message => {
    signatures++;
    const text = new TextDecoder().decode(message);
    assert.ok(isCanonicalTsnMessage(text));
    assert.ok(text.startsWith("TSN TIN Balance Payment Preparation\n---\n"));
    assert.match(text, /Sender TIN: 1234567890\nRecipient TIN: 2345678901/);
    assert.match(text, /Expires: \d{4}-\d{2}-\d{2}T/);
    assert.doesNotMatch(text, /[\u0000-\u0009\u000b-\u001f\u007f]/);
    return nacl.sign.detached(message, key.secretKey);
  };
  p.debitClient = { post: async (path, body) => {
    calls++; assert.equal(path, "/network/tin-debit/prepare");
    const message = new TextEncoder().encode(buildTinDebitPreparationMessage({
      senderTin: p.tin, recipientTin: p.recipientTin, tokenMintAddress: p.tokenMintAddress, expiresAt: body.expiresAt,
    }));
    assert.ok(nacl.sign.detached.verify(message, Buffer.from(body.signature,"hex"), key.publicKey.toBytes()));
    for (const changed of [{ recipientTin: "3456789012" }, { tokenMintAddress: "22222222222222222222222222222222" }, { expiresAt: String(Number(body.expiresAt) + 1) }]) {
      const altered = new TextEncoder().encode(buildTinDebitPreparationMessage({
        senderTin: p.tin, recipientTin: p.recipientTin, tokenMintAddress: p.tokenMintAddress, expiresAt: body.expiresAt, ...changed,
      }));
      assert.equal(nacl.sign.detached.verify(altered, Buffer.from(body.signature, "hex"), key.publicKey.toBytes()), false);
    }
    throw new Error("preparation unavailable");
  } };
  await assert.rejects(sendTinDebitV1(p), /preparation unavailable/);
  assert.equal(calls,1); assert.equal(signatures,1); assert.equal(p.retryState.requestJson,undefined);
  p.ownerWallet.signMessage = async () => new Uint8Array(64);
  await assert.rejects(sendTinDebitV1(p), /connected owner's signature/);
  assert.equal(calls,1);
});
