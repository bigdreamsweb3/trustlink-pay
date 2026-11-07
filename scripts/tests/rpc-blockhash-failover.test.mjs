import assert from "node:assert/strict";
import { test } from "node:test";
import { createRpcGatewayApp } from "../../tsn-protocol/services/tsn-rpc-gateway/gateway.mjs";
import { getRpcGatewayConfig } from "../../tsn-protocol/services/tsn-rpc-gateway/config.mjs";

async function requestWith(outcomes, method = "simulateTransaction") {
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
    const payload = { jsonrpc: "2.0", id: 42, method, params: ["synthetic-signed-wire", { sigVerify: true, replaceRecentBlockhash: false }] };
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

test("Gateway does not treat a program rejection as provider lag", async () => {
  const rejected = { jsonrpc: "2.0", id: 42, result: { value: { err: { InstructionError: [0, "Custom"] } } } };
  const result = await requestWith([rejected]);
  assert.deepEqual(result.body, rejected);
  assert.equal(result.calls.length, 1);
});
