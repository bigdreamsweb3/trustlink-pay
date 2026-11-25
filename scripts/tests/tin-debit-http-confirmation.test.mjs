import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { sendAndConfirmDebitTransaction } from "../tin-debit-http-confirmation.mjs";

const require = createRequire(new URL("../../tsn-protocol/sdks/tsn-sdk/package.json", import.meta.url));
const { Keypair, PublicKey, Transaction, SystemProgram } = require("@solana/web3.js");
const base58Module = require("bs58");
const base58 = base58Module.default ?? base58Module;

function harness() {
  const signer = Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => 7));
  const blockhashContext = { context: { slot: 50 },
    value: { blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 100 } };
  const transaction = new Transaction({ feePayer: signer.publicKey,
    blockhash: blockhashContext.value.blockhash, lastValidBlockHeight: 100 })
    .add(SystemProgram.transfer({ fromPubkey: signer.publicKey, toPubkey: PublicKey.default, lamports: 1 }));
  const calls = [], candidates = [];
  let now = 0;
  const status = (confirmationStatus = "confirmed") => ({ slot: 60, confirmations: confirmationStatus === "finalized" ? null : 1,
    confirmationStatus, err: null });
  const connection = {
    sendRawTransaction: async (wire, options) => {
      calls.push({ method: "send", options });
      const signed = Transaction.from(wire);
      assert.equal(signed.verifySignatures(), true);
      assert.equal(signed.recentBlockhash, blockhashContext.value.blockhash);
      assert.equal(candidates.length, 1, "candidate is recorded before broadcast");
      const signature = base58.encode(signed.signature);
      assert.equal(candidates[0].signature, signature);
      return signature;
    },
    getSignatureStatuses: async (signatures, options) => {
      calls.push({ method: "status", signatures, options });
      return { context: { slot: 70 }, value: [status()] };
    },
    getBlockHeight: async options => { calls.push({ method: "height", options }); return 90; },
    confirmTransaction: () => { throw Error("WebSocket confirmation must not be used"); },
    onSignature: () => { throw Error("WebSocket subscription must not be used"); },
  };
  const options = { blockhashContext, onSigned: candidate => candidates.push(candidate),
    clock: () => now, sleep: async ms => { now += ms; }, pollMs: 1, timeoutMs: 4 };
  const run = () => sendAndConfirmDebitTransaction(connection, transaction, [signer], options);
  return { connection, transaction, options, calls, candidates, status, run };
}

test("confirmed and finalized HTTP status accept exactly one signed broadcast", async () => {
  for (const phase of ["confirmed", "finalized"]) {
    const h = harness();
    const original = h.connection.getSignatureStatuses;
    h.connection.getSignatureStatuses = async (...args) => {
      const result = await original(...args); result.value = [h.status(phase)]; return result;
    };
    const signature = await h.run();
    assert.equal(signature, h.candidates[0].signature);
    assert.deepEqual(h.calls.map(call => call.method), ["send", "status"]);
    assert.deepEqual(h.calls[0].options, { skipPreflight: false, preflightCommitment: "confirmed", minContextSlot: 50, maxRetries: 3 });
    assert.deepEqual(h.calls[1].options, { searchTransactionHistory: true });
    assert.deepEqual(h.calls[1].signatures, [signature]);
  }
});

test("processed status waits for confirmation and checks the issued height/context", async () => {
  const h = harness(), original = h.connection.getSignatureStatuses;
  let reads = 0;
  h.connection.getSignatureStatuses = async (...args) => {
    const result = await original(...args); result.value = [h.status(++reads === 1 ? "processed" : "confirmed")]; return result;
  };
  await h.run();
  assert.deepEqual(h.calls.map(call => call.method), ["send", "status", "height", "status"]);
  assert.deepEqual(h.calls[2].options, { commitment: "confirmed", minContextSlot: 50 });
});

test("a chain rejection stops with the candidate signature and no further broadcast", async () => {
  const h = harness();
  h.connection.getSignatureStatuses = async () => ({ context: { slot: 70 }, value: [{ ...h.status(), err: { InstructionError: [0, { Custom: 1 }] } }] });
  await assert.rejects(h.run(), error => error.message.startsWith("TIN_DEBIT_CHAIN_REJECTED;") && error.message.includes(h.candidates[0].signature));
  assert.equal(h.calls.filter(call => call.method === "send").length, 1);
});

test("expiry re-reads status and does not refresh or rebroadcast the signed transaction", async () => {
  const h = harness(), original = h.connection.getSignatureStatuses;
  let reads = 0;
  h.connection.getSignatureStatuses = async (...args) => { reads++; const result = await original(...args); result.value = [null]; return result; };
  h.connection.getBlockHeight = async () => 101;
  await assert.rejects(h.run(), /TIN_DEBIT_CONFIRMATION_EXPIRED; inspect signature/);
  assert.equal(reads, 2);
  assert.equal(h.calls.filter(call => call.method === "send").length, 1);
  assert.equal(h.transaction.lastValidBlockHeight, 100);
});

test("a finalized status found in the expiry reconciliation read succeeds", async () => {
  const h = harness(), original = h.connection.getSignatureStatuses;
  let reads = 0;
  h.connection.getSignatureStatuses = async (...args) => {
    const result = await original(...args); result.value = [++reads === 1 ? null : h.status("finalized")]; return result;
  };
  h.connection.getBlockHeight = async () => 101;
  assert.equal(await h.run(), h.candidates[0].signature);
  assert.equal(reads, 2);
});

test("unknown status times out with the signature and no replacement send", async () => {
  const h = harness();
  h.connection.getSignatureStatuses = async () => ({ context: { slot: 70 }, value: [null] });
  await assert.rejects(h.run(), /TIN_DEBIT_CONFIRMATION_TIMEOUT; inspect signature/);
  assert.equal(h.calls.filter(call => call.method === "send").length, 1);
});

test("transient HTTP reads recover without assuming confirmation or expiry", async () => {
  const h = harness(), original = h.connection.getSignatureStatuses;
  let reads = 0;
  h.connection.getSignatureStatuses = async (...args) => {
    if (++reads === 1) throw Error("temporary RPC error");
    return original(...args);
  };
  assert.equal(await h.run(), h.candidates[0].signature);
  assert.equal(reads, 2);
});

test("stale or malformed status context stays uncertain instead of establishing expiry", async () => {
  for (const result of [{ context: { slot: 49 }, value: [null] }, { value: [null] }, { context: { slot: 70 }, value: [] }]) {
    const h = harness();
    h.connection.getSignatureStatuses = async () => result;
    h.connection.getBlockHeight = () => { throw Error("stale status must not be used to establish expiry"); };
    await assert.rejects(h.run(), /TIN_DEBIT_CONFIRMATION_RPC_UNAVAILABLE; inspect signature/);
  }
});

test("a lost send acknowledgement retains the pre-broadcast signature without starting another send", async () => {
  const h = harness();
  let sends = 0;
  h.connection.sendRawTransaction = async () => { sends++; throw Error("secret provider diagnostic"); };
  await assert.rejects(h.run(), error => error.message.startsWith("TIN_DEBIT_SEND_UNCONFIRMED;")
    && error.message.includes(h.candidates[0].signature) && !error.message.includes("secret provider"));
  assert.equal(sends, 1);
});

test("a mismatched RPC signature is rejected before confirmation polling", async () => {
  const h = harness();
  h.connection.sendRawTransaction = async () => "another-signature";
  await assert.rejects(h.run(), /TIN_DEBIT_RPC_SIGNATURE_MISMATCH; inspect signature/);
  assert.equal(h.calls.length, 0);
});

test("mismatched lifetime/context fails before signing or broadcasting", async () => {
  for (const mutate of [h => { h.transaction.lastValidBlockHeight = 101; },
    h => { h.options.blockhashContext.context.slot = 0; },
    h => { h.options.blockhashContext.value.blockhash = "another-hash"; }]) {
    const h = harness(); mutate(h);
    await assert.rejects(h.run(), /TIN_DEBIT_BLOCKHASH_CONTEXT_INVALID/);
    assert.equal(h.transaction.signature, null);
    assert.equal(h.calls.length, 0);
  }
});
