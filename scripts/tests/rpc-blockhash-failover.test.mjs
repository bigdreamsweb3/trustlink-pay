import assert from "node:assert/strict";
import { test } from "node:test";
import { createRpcGatewayApp } from "../../tsn-protocol/services/tsn-rpc-gateway/gateway.mjs";
import { getRpcGatewayConfig } from "../../tsn-protocol/services/tsn-rpc-gateway/config.mjs";

async function requestWith(outcomes, method = "simulateTransaction", options = { sigVerify: true, replaceRecentBlockhash: false }) {
  const config = getRpcGatewayConfig({ TSN_SOLANA_RPC_UPSTREAM_URLS: "https://one.test https://two.test", TSN_RPC_GATEWAY_LOG_LEVEL: "silent" });
  config.upstreams = config.upstreams.slice(0, 2);
  const gateway = createRpcGatewayApp(config), calls = [];
  const savedFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, body: options.body });
      const outcome = outcomes[calls.length - 1];
      if (outcome instanceof Error) throw outcome;
      return new Response(JSON.stringify(outcome), { status: 200 });
    };
    const payload = { jsonrpc: "2.0", id: 42, method, params: ["synthetic-signed-wire", options] };
    const response = await gateway.fetch(new Request("http://gateway.test/rpc", { method: "POST", body: JSON.stringify(payload) }));
    assert.ok(calls.every(call => call.body === JSON.stringify(payload)), "Every attempt must preserve the exact request");
    return { body: await response.json(), calls, status: gateway.pool.getStatus() };
  } finally {
    globalThis.fetch = savedFetch;
  }
}

const missing = { jsonrpc: "2.0", id: 42, result: { value: { err: "BlockhashNotFound" } } };
const passed = { jsonrpc: "2.0", id: 42, result: { value: { err: null } } };

test("Gateway retries bank blockhash rejection with identical simulation request", async () => {
  const result = await requestWith([missing, passed]);
  assert.deepEqual(result.body, passed);
  assert.equal(result.calls.length, 2);
});

test("Gateway returns definitive invalidity only when all attempted banks answered", async () => {
  const result = await requestWith([missing, missing]);
  assert.deepEqual(result.body, missing);
  assert.equal(result.calls.length, 2);
  for (const outcomes of [[missing, new Error("synthetic timeout")], [new Error("synthetic timeout"), missing]]) {
    const unknown = await requestWith(outcomes);
    assert.equal(unknown.body.error.code, -32000);
    assert.equal(unknown.body.result, undefined);
  }
});

test("Gateway retries sendTransaction preflight blockhash rejection without changing its wire", async () => {
  const rejection = { jsonrpc: "2.0", id: 42, error: { code: -32002, data: { err: "BlockhashNotFound" } } };
  const sent = { jsonrpc: "2.0", id: 42, result: "synthetic-signature" };
  assert.deepEqual((await requestWith([rejection, sent], "sendTransaction")).body, sent);
});

test("Gateway retries minimum-context-slot lag while preserving simulation and send requirements", async () => {
  const lagging = { jsonrpc: "2.0", id: 42, error: { code: -32016, message: "Minimum context slot has not been reached", data: { contextSlot: 12000 } } };
  const simulationOptions = { sigVerify: true, replaceRecentBlockhash: false, commitment: "confirmed", minContextSlot: 12345 };
  const sendOptions = { skipPreflight: false, preflightCommitment: "confirmed", minContextSlot: 12345 };
  const sent = { jsonrpc: "2.0", id: 42, result: "synthetic-signature" };
  for (const [method, options, success] of [["simulateTransaction", simulationOptions, passed], ["sendTransaction", sendOptions, sent]]) {
    const result = await requestWith([lagging, success], method, options);
    assert.deepEqual(result.body, success);
    assert.equal(result.calls.length, 2);
    for (const call of result.calls) assert.deepEqual(JSON.parse(call.body).params[1], options);
  }
});

test("Gateway fails closed when no provider reaches the pinned context slot", async () => {
  const lagging = { jsonrpc: "2.0", id: 42, error: { code: -32016, message: "Minimum context slot has not been reached" } };
  const result = await requestWith([lagging, lagging], "sendTransaction", { skipPreflight: false, preflightCommitment: "confirmed", minContextSlot: 12345 });
  assert.equal(result.calls.length, 2);
  assert.equal(result.body.error.code, -32000);
  assert.equal(result.body.result, undefined);
});

test("Gateway does not treat a program rejection as provider lag", async () => {
  const programError = { InstructionError: [0, "Custom"] };
  for (const [method, rejected] of [
    ["simulateTransaction", { jsonrpc: "2.0", id: 42, result: { value: { err: programError } } }],
    ["sendTransaction", { jsonrpc: "2.0", id: 42, error: { code: -32002, message: "Transaction simulation failed", data: { err: programError } } }],
  ]) {
    const result = await requestWith([rejected], method, { minContextSlot: 12345 });
    assert.deepEqual(result.body, rejected);
    assert.equal(result.calls.length, 1);
  }
});
