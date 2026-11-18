import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { inspectTinFundingOutcome } from "../../protocol-tests/ui/funding-outcome.mjs";

// All transaction signatures below use synthetic local test keys. The RPC port
// is mocked; no wallet approvals, live network calls or submissions occur.
const owner = Keypair.fromSeed(new Uint8Array(32).fill(11));
const recipient = new PublicKey(new Uint8Array(32).fill(12));
const context = { blockhash: new PublicKey(new Uint8Array(32).fill(13)).toBase58(), contextSlot: 100, lastValidBlockHeight: 200 };
const wire = new Transaction({ feePayer: owner.publicKey, recentBlockhash: context.blockhash })
  .add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: recipient, lamports: 1 }));
wire.sign(owner);
const signature = bs58.encode(wire.signatures[0].signature);
const completion = { workId: "synthetic-work", senderFundingDepositTxB64: wire.serialize().toString("base64"), senderFundingBlockhashContext: context };
const endpoint = "http://127.0.0.1:1/synthetic-rpc";
const clone = value => structuredClone(value);
const receipt = (err = null) => ({ slot: 103, transaction: { signatures: [signature] }, meta: { err } });
const chainStatus = (confirmationStatus = "finalized", err = null) => ({ slot: 103, confirmations: confirmationStatus === "finalized" ? null : 1, confirmationStatus, err });

function rpcHarness({ results = {}, envelopes = {}, failures = {}, httpFailures = [] } = {}) {
  const calls = [], counts = {};
  const fetchImpl = async (url, options) => {
    const request = JSON.parse(options.body), { method, id } = request;
    const index = counts[method] = (counts[method] ?? 0) + 1;
    calls.push({ url, options, ...request });
    if (failures[method]) throw failures[method];
    if (httpFailures.includes(method)) return { ok: false, json: async () => ({}) };
    const result = Object.hasOwn(results, method) ? (typeof results[method] === "function" ? results[method](index) : results[method]) : {
      getFirstAvailableBlock: 90, minimumLedgerSlot: 95, getSlot: 101, getTransaction: null,
      getSignatureStatuses: { context: { slot: index === 1 ? 102 : 105 }, value: [null] },
      isBlockhashValid: { context: { slot: 103 }, value: false }, getBlockHeight: 201,
    }[method];
    const envelope = Object.hasOwn(envelopes, method)
      ? (typeof envelopes[method] === "function" ? envelopes[method]({ method, id, result }) : envelopes[method])
      : { jsonrpc: "2.0", id, result };
    return { ok: true, json: async () => envelope };
  };
  return { calls, inspect: (saved = completion, url = endpoint) => inspectTinFundingOutcome({ completion: saved, rpcUrl: url, fetchImpl }) };
}

test("XP clears only an exact expired funding identity absent from retained finalized history twice", async () => {
  const harness = rpcHarness(), saved = clone(completion), result = await harness.inspect(saved);
  assert.deepEqual(result, { status: "NONEXECUTION_CONFIRMED", signature, reason: "FINALIZED_EXPIRY_AND_ABSENCE_CONFIRMED",
    evidence: { contextSlot: 100, finalizedContextSlot: 103, signatureStatusContextSlot: 105, observedBlockHeight: 201,
      lastValidBlockHeight: 200, firstAvailableBlock: 90, minimumLedgerSlot: 95 } });
  assert.deepEqual(saved, completion, "inspection must preserve saved authorization material");
  assert.deepEqual(harness.calls.map(call => call.method), ["getFirstAvailableBlock", "minimumLedgerSlot", "getSlot", "getTransaction", "getSignatureStatuses",
    "isBlockhashValid", "getBlockHeight", "getTransaction", "getSignatureStatuses"]);
  assert.equal(new Set(harness.calls.map(call => call.url)).size, 1);
  assert.equal(harness.calls[0].url, endpoint);
  assert.equal(new Set(harness.calls.map(call => call.id)).size, 9);
  for (const call of harness.calls) {
    assert.equal(call.options.redirect, "error"); assert.equal(call.options.cache, "no-store");
    assert.ok(call.options.signal instanceof AbortSignal);
    assert.equal(call.options.body.includes(completion.senderFundingDepositTxB64), false, "no RPC receives signed bytes");
    assert.equal(/^(send|simulate|sign)/i.test(call.method), false);
    if (["getSlot", "isBlockhashValid", "getBlockHeight", "getTransaction"].includes(call.method)) {
      assert.equal(call.params.at(-1).commitment, "finalized");
    }
    if (call.method === "getSignatureStatuses") assert.deepEqual(call.params, [[signature], { searchTransactionHistory: true }]);
  }
  assert.deepEqual(harness.calls.filter(call => ["getSlot", "isBlockhashValid", "getBlockHeight"].includes(call.method))
    .map(call => call.params.at(-1).minContextSlot), [100, 102, 103]);
  assert.equal(JSON.stringify(result).includes(completion.senderFundingDepositTxB64), false);
  assert.equal(JSON.stringify(result).includes(context.blockhash), false);
});

for (const [label, err] of [["successful", null], ["failed", { InstructionError: [0, "Custom"] }]]) {
  test(`XP retains a funding guard for an observed ${label} finalized transaction`, async () => {
    const harness = rpcHarness({ results: { getTransaction: receipt(err) } }), result = await harness.inspect();
    assert.equal(result.status, "FUNDING_OBSERVED"); assert.equal(result.signature, signature);
    assert.equal(result.reason, "FUNDING_TRANSACTION_OBSERVED"); assert.equal(result.evidence.chainError, err !== null);
    assert.equal(harness.calls.length, 4, "observed funding must stop before expiry-based clearance");
  });
}

for (const phase of ["processed", "confirmed", "finalized"]) {
  test(`XP retains a funding guard for a ${phase} signature even without a finalized receipt`, async () => {
    const result = await rpcHarness({ results: { getSignatureStatuses: { context: { slot: 102 }, value: [chainStatus(phase)] } } }).inspect();
    assert.equal(result.status, "FUNDING_OBSERVED"); assert.equal(result.reason, "FUNDING_SIGNATURE_OBSERVED");
    assert.equal(result.evidence.confirmationStatus, phase);
  });
}

test("XP retains a failed chain signature for reconciliation rather than treating it as missing funding", async () => {
  const result = await rpcHarness({ results: { getSignatureStatuses: { context: { slot: 102 }, value: [chainStatus("finalized", "AccountInUse")] } } }).inspect();
  assert.equal(result.status, "FUNDING_OBSERVED"); assert.equal(result.evidence.chainError, true);
});

test("XP rechecks original receipt and history after expiry to detect concurrent execution", async () => {
  const txHarness = rpcHarness({ results: { getTransaction: index => index === 1 ? null : receipt() } });
  assert.equal((await txHarness.inspect()).status, "FUNDING_OBSERVED"); assert.equal(txHarness.calls.length, 8);
  const statusHarness = rpcHarness({ results: { getSignatureStatuses: index => ({ context: { slot: index === 1 ? 102 : 105 }, value: [index === 1 ? null : chainStatus("processed")] }) } });
  assert.equal((await statusHarness.inspect()).status, "FUNDING_OBSERVED"); assert.equal(statusHarness.calls.length, 9);
});

for (const [label, changed] of [
  ["missing wire", { ...completion, senderFundingDepositTxB64: undefined }],
  ["malformed base64", { ...completion, senderFundingDepositTxB64: "not base64!" }],
  ["trailing wire bytes", { ...completion, senderFundingDepositTxB64: Buffer.concat([wire.serialize(), Buffer.from([1])]).toString("base64") }],
  ["mismatched blockhash", { ...completion, senderFundingBlockhashContext: { ...context, blockhash: recipient.toBase58() } }],
  ["unsafe context", { ...completion, senderFundingBlockhashContext: { ...context, contextSlot: Number.MAX_SAFE_INTEGER + 1 } }],
  ["string deadline", { ...completion, senderFundingBlockhashContext: { ...context, lastValidBlockHeight: "200" } }],
  ["negative deadline", { ...completion, senderFundingBlockhashContext: { ...context, lastValidBlockHeight: -1 } }],
  ["fractional context", { ...completion, senderFundingBlockhashContext: { ...context, contextSlot: 100.1 } }],
]) {
  test(`XP refuses ${label} before reading RPC`, async () => {
    const harness = rpcHarness(), result = await harness.inspect(changed);
    assert.deepEqual(result, { status: "OUTCOME_UNKNOWN", signature: null, reason: "INVALID_SAVED_SIGNED_FUNDING" });
    assert.equal(harness.calls.length, 0);
  });
}

test("XP verifies saved transaction signatures instead of trusting a supplied signature identity", async () => {
  const altered = Buffer.from(completion.senderFundingDepositTxB64, "base64"); altered[1] ^= 1;
  const unsigned = Transaction.from(wire.serialize()); unsigned.signatures[0].signature = null;
  for (const senderFundingDepositTxB64 of [altered.toString("base64"), unsigned.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64")]) {
    const harness = rpcHarness(), result = await harness.inspect({ ...completion, senderFundingDepositTxB64 });
    assert.equal(result.reason, "INVALID_SAVED_SIGNED_FUNDING"); assert.equal(harness.calls.length, 0);
  }
});

for (const [method, value] of [["getFirstAvailableBlock", 101], ["minimumLedgerSlot", 101], ["getFirstAvailableBlock", null], ["minimumLedgerSlot", "95"]]) {
  test(`XP refuses missing historical coverage from ${method}=${String(value)}`, async () => {
    const result = await rpcHarness({ results: { [method]: value } }).inspect();
    assert.equal(result.status, "OUTCOME_UNKNOWN"); assert.equal(result.reason, "HISTORY_COVERAGE_UNAVAILABLE");
  });
}

test("XP refuses failed or malformed coverage RPC responses", async () => {
  for (const options of [{ failures: { getFirstAvailableBlock: new Error("private endpoint detail") } },
    { envelopes: { minimumLedgerSlot: ({ id }) => ({ jsonrpc: "2.0", id, error: { code: -32000, message: "private endpoint detail" } }) } }]) {
    const result = await rpcHarness(options).inspect();
    assert.equal(result.reason, "HISTORY_COVERAGE_UNAVAILABLE"); assert.equal(JSON.stringify(result).includes("private endpoint detail"), false);
  }
});

for (const [label, results, reason] of [
  ["valid hash", { isBlockhashValid: { context: { slot: 103 }, value: true } }, "BLOCKHASH_STILL_VALID"],
  ["deadline height", { getBlockHeight: 200 }, "BLOCKHASH_LIFETIME_NOT_EXPIRED"],
  ["earlier height", { getBlockHeight: 199 }, "BLOCKHASH_LIFETIME_NOT_EXPIRED"],
  ["lagging finalized context", { getSlot: 99 }, "RPC_CONTEXT_BEHIND"],
  ["lagging signature context", { getSignatureStatuses: { context: { slot: 100 }, value: [null] } }, "RPC_CONTEXT_BEHIND"],
  ["lagging validity context", { isBlockhashValid: { context: { slot: 101 }, value: false } }, "RPC_CONTEXT_BEHIND"],
  ["lagging repeated history", { getSignatureStatuses: index => ({ context: { slot: index === 1 ? 102 : 102 }, value: [null] }) }, "RPC_CONTEXT_BEHIND"],
]) {
  test(`XP refuses clearance with ${label}`, async () => {
    const result = await rpcHarness({ results }).inspect(); assert.equal(result.status, "OUTCOME_UNKNOWN"); assert.equal(result.reason, reason);
  });
}

for (const [label, results] of [
  ["missing statuses context", { getSignatureStatuses: { value: [null] } }],
  ["extra statuses entries", { getSignatureStatuses: { context: { slot: 102 }, value: [null, null] } }],
  ["missing status entry", { getSignatureStatuses: { context: { slot: 102 }, value: [] } }],
  ["non-boolean hash validity", { isBlockhashValid: { context: { slot: 103 }, value: "false" } }],
  ["unsafe block height", { getBlockHeight: Number.MAX_SAFE_INTEGER + 1 }],
  ["wrong receipt signature", { getTransaction: { ...receipt(), transaction: { signatures: ["unrelated"] } } }],
  ["malformed receipt", { getTransaction: false }],
  ["malformed chain status", { getSignatureStatuses: { context: { slot: 102 }, value: [{ slot: 103 }] } }],
]) {
  test(`XP rejects ${label} RPC schema`, async () => {
    const result = await rpcHarness({ results }).inspect(); assert.equal(result.status, "OUTCOME_UNKNOWN"); assert.equal(result.reason, "RPC_RESPONSE_INVALID");
  });
}

for (const [label, envelope, reason] of [
  ["wrong request id", ({ result }) => ({ jsonrpc: "2.0", id: "unrelated", result }), "RPC_RESPONSE_INVALID"],
  ["wrong version", ({ id, result }) => ({ jsonrpc: "1.0", id, result }), "RPC_RESPONSE_INVALID"],
  ["both result and error", ({ id, result }) => ({ jsonrpc: "2.0", id, result, error: { code: -1, message: "hidden" } }), "RPC_RESPONSE_INVALID"],
  ["RPC error", ({ id }) => ({ jsonrpc: "2.0", id, error: { code: -32000, message: "hidden endpoint detail" } }), "RPC_ERROR"],
]) {
  test(`XP fails closed for ${label}`, async () => {
    const result = await rpcHarness({ envelopes: { getSlot: envelope } }).inspect();
    assert.equal(result.status, "OUTCOME_UNKNOWN"); assert.equal(result.reason, reason);
    assert.equal(JSON.stringify(result).includes("hidden"), false);
  });
}

test("XP returns sanitized uncertainty for network and HTTP failures", async () => {
  for (const options of [{ failures: { getSlot: new Error("private endpoint detail") } }, { httpFailures: ["getSlot"] }]) {
    const result = await rpcHarness(options).inspect(); assert.equal(result.reason, "RPC_REQUEST_FAILED");
    assert.equal(JSON.stringify(result).includes("private endpoint detail"), false);
  }
});

test("XP rejects invalid RPC endpoints before any network reads", async () => {
  const harness = rpcHarness(), result = await harness.inspect(completion, "file:///synthetic");
  assert.equal(result.reason, "INVALID_RPC_ENDPOINT"); assert.equal(harness.calls.length, 0);
});

test("XP aborts a stalled RPC read within the per-call deadline", { timeout: 6_000 }, async () => {
  let signal;
  const started = Date.now(), result = await inspectTinFundingOutcome({ completion, rpcUrl: endpoint, fetchImpl: async (_url, options) => {
    const { method, id } = JSON.parse(options.body);
    if (method === "getSlot") { signal = options.signal; return new Promise(() => {}); }
    return { ok: true, json: async () => ({ jsonrpc: "2.0", id, result: 90 }) };
  } });
  assert.equal(result.status, "OUTCOME_UNKNOWN"); assert.equal(result.reason, "RPC_TIMEOUT");
  assert.equal(signal.aborted, true); assert.ok(Date.now() - started < 5_500);
});
