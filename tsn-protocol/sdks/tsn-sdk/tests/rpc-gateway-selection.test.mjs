import assert from "node:assert/strict";
import test from "node:test";
import { resolveSolanaRpcUrls } from "../dist/rpc.js";
import { getTsnNetworkStatus } from "../dist/network-status.js";

test("SDK defaults to the TSN RPC gateway and never adds a local or public fallback", () => {
  const previousPreferred = process.env.TSN_RPC_URL;
  const previous = process.env.TSN_RPC_GATEWAY_URL;
  delete process.env.TSN_RPC_URL;
  delete process.env.TSN_RPC_GATEWAY_URL;
  assert.deepEqual(resolveSolanaRpcUrls(), ["https://tsn-rpc-gateway.vercel.app"]);

  process.env.TSN_RPC_URL = "http://127.0.0.1:8787/";
  assert.deepEqual(resolveSolanaRpcUrls(), ["http://127.0.0.1:8787"]);

  if (previousPreferred === undefined) delete process.env.TSN_RPC_URL;
  else process.env.TSN_RPC_URL = previousPreferred;
  if (previous === undefined) delete process.env.TSN_RPC_GATEWAY_URL;
  else process.env.TSN_RPC_GATEWAY_URL = previous;
});

test("network status checks only the configured RPC gateway when live and local RPCs are supplied", async () => {
  const requested = [];
  const status = await getTsnNetworkStatus({
    local: { rpc: "http://127.0.0.1:8787" },
    live: { rpc: "https://tsn-rpc-gateway.vercel.app" },
    fetchImpl: async (input) => {
      requested.push(String(input));
      return new Response(JSON.stringify({ result: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.deepEqual(requested, ["https://tsn-rpc-gateway.vercel.app"]);
  assert.deepEqual(status.selected.rpc, {
    source: "configured",
    url: "https://tsn-rpc-gateway.vercel.app",
  });
});
