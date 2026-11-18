import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createRpcGatewayApp } from "../../tsn-protocol/services/tsn-rpc-gateway/gateway.mjs";
import { getRpcGatewayConfig } from "../../tsn-protocol/services/tsn-rpc-gateway/config.mjs";

const owner = Keypair.fromSeed(new Uint8Array(32).fill(31));
const hash = new PublicKey(new Uint8Array(32).fill(32));
const instruction = SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: new PublicKey(new Uint8Array(32).fill(33)), lamports: 1 });
const legacy = new Transaction({ feePayer: owner.publicKey, recentBlockhash: hash.toBase58() }).add(instruction);
legacy.sign(owner);
const versioned = new VersionedTransaction(new TransactionMessage({ payerKey: owner.publicKey, recentBlockhash: hash.toBase58(), instructions: [instruction] }).compileToV0Message());
versioned.sign([owner]);
const fingerprint = createHash("sha256").update(hash.toBytes()).digest("hex").slice(0, 16);

async function withGateway(operation) {
  const config = getRpcGatewayConfig({ TSN_SOLANA_RPC_UPSTREAM_URLS: "https://one.test/private?api-key=hidden-secret https://two.test/private?api-key=hidden-secret", TSN_RPC_GATEWAY_LOG_LEVEL: "info" });
  config.upstreams = config.upstreams.slice(0, 2);
  const gateway = createRpcGatewayApp(config), lines = [], calls = [];
  const saved = { fetch: globalThis.fetch, log: console.log, warn: console.warn, error: console.error };
  try {
    console.log = console.warn = console.error = (...values) => lines.push(values.join(" "));
    await operation({ gateway, lines, calls, respond: responseFor => {
      globalThis.fetch = async (url, init) => {
        const body = JSON.parse(String(init?.body));
        calls.push({ url: String(url), body });
        return new Response(JSON.stringify(responseFor(body, calls.length)), { status: 200 });
      };
    }, request: async payload => (await gateway.fetch(new Request("https://gateway.test/rpc", { method: "POST", body: JSON.stringify(payload) }))).json() });
  } finally { globalThis.fetch = saved.fetch; console.log = saved.log; console.warn = saved.warn; console.error = saved.error; }
}

test("gateway correlates issued hashes with legacy/v0 rejection diagnostics without exposing wires or provider credentials", async () => {
  await withGateway(async ({ request, respond, lines, calls }) => {
    respond(body => body.method === "getLatestBlockhash"
      ? { jsonrpc: "2.0", id: body.id, result: { context: { slot: 71 }, value: { blockhash: hash.toBase58(), lastValidBlockHeight: 1100 } } }
      : { jsonrpc: "2.0", id: body.id, result: { context: { slot: 99 }, value: { err: "BlockhashNotFound" } } });
    await request({ jsonrpc: "2.0", id: "issue", method: "getLatestBlockhash", params: [{ commitment: "confirmed" }] });
    for (const [index, transaction] of [legacy, versioned].entries()) {
      const wire = Buffer.from(transaction.serialize()).toString("base64");
      const payload = { jsonrpc: "2.0", id: `simulate-${index}`, method: "simulateTransaction",
        params: [wire, { encoding: "base64", sigVerify: true, replaceRecentBlockhash: false, commitment: "confirmed", minContextSlot: 71 }] };
      const rejected = await request(payload);
      assert.equal(rejected.result.value.err, "BlockhashNotFound");
      assert.ok(calls.filter(call => call.body.id === payload.id).every(call => JSON.stringify(call.body) === JSON.stringify(payload)));
      assert.ok(lines.filter(line => line.includes(`id=${payload.id}`)).every(line => line.includes(`blockhashFingerprint=${fingerprint}`)));
      assert.ok(!lines.some(line => line.includes(wire)));
    }
    const issued = lines.find(line => line.includes("id=issue"));
    assert.ok(issued.includes(`blockhashFingerprint=${fingerprint}`));
    assert.ok(issued.includes("contextSlot=71") && issued.includes("lastValidBlockHeight=1100"));
    assert.equal(lines.filter(line => line.includes("blockhash unavailable")).length, 4);
    assert.ok(lines.filter(line => line.includes("blockhash unavailable")).every(line => line.includes("minContextSlot=71") && line.includes("responseContextSlot=99")));
    assert.ok(!lines.some(line => /hidden-secret|private\?|https:\/\/one|https:\/\/two/.test(line)));
    assert.ok(!lines.some(line => line.includes(hash.toBase58())));
  });
});

test("terminal RPC errors and simulation program rejections are not logged as upstream success", async () => {
  await withGateway(async ({ request, respond, lines, calls }) => {
    const programError = { InstructionError: [0, "Custom"] };
    respond(body => body.method === "simulateTransaction"
      ? { jsonrpc: "2.0", id: body.id, result: { value: { err: programError } } }
      : { jsonrpc: "2.0", id: body.id, error: { code: -32002, message: "Transaction simulation failed", data: { err: programError } } });
    const options = { encoding: "base64", minContextSlot: 71 };
    for (const method of ["simulateTransaction", "sendTransaction"]) await request({ jsonrpc: "2.0", id: method, method, params: [legacy.serialize().toString("base64"), options] });
    assert.equal(calls.length, 2, "terminal program failures must not trigger failover");
    assert.ok(lines.some(line => line.includes("simulation rejected")));
    assert.ok(lines.some(line => line.includes("upstream RPC error") && line.includes("rpcErrorCode=-32002")));
    assert.ok(!lines.some(line => line.includes("upstream success")));
  });
});

test("malformed or unsupported diagnostic wires still pass through unchanged", async () => {
  await withGateway(async ({ request, respond, lines, calls }) => {
    respond(body => ({ jsonrpc: "2.0", id: body.id, result: { value: { err: null } } }));
    for (const wire of ["not-base64", "a".repeat(11_000), Buffer.from([0x81, 0, 0]).toString("base64")]) {
      const payload = { jsonrpc: "2.0", id: calls.length, method: "simulateTransaction", params: [wire, { encoding: "base64", minContextSlot: 0 }] };
      assert.equal((await request(payload)).result.value.err, null);
      assert.deepEqual(calls.at(-1).body, payload);
    }
    assert.ok(!lines.some(line => line.includes("blockhashFingerprint=")));
  });
});
