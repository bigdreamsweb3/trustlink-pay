import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { decodeTcapTinTipV1Account, fetchTcapTinTipV1 } from "../dist/index.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const address = "Tip111111111111111111111111111111111111111";
const owner = "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x";

function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function fixture() {
  const discriminator = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("account:TCapTinTipV1"))).slice(0, 8);
  const bytes = new Uint8Array(116);
  bytes.set(discriminator, 0);
  new DataView(bytes.buffer).setUint16(8, 1, false);
  bytes.set(new Uint8Array(32).fill(0xab), 10);
  new DataView(bytes.buffer).setBigUint64(42, 9n, false);
  bytes.set(new Uint8Array(32).fill(0xcd), 50);
  bytes.set(new Uint8Array(32).fill(0xef), 82);
  bytes[114] = 0;
  bytes[115] = 253;
  return { owner, lamports: 1234, data: [base64(bytes), "base64"] };
}

test("decodes a TcapTinTipV1 account fixture", async () => {
  const decoded = decodeTcapTinTipV1Account(address, await fixture(), owner, new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("account:TCapTinTipV1"))).slice(0, 8));
  assert.equal(decoded.version, 1);
  assert.equal(decoded.sequence, 9n);
  assert.equal(decoded.current_commitment, "ab".repeat(32));
  assert.equal(decoded.policy_commitment, "cd".repeat(32));
  assert.equal(decoded.last_transition_nullifier, "ef".repeat(32));
  assert.equal(decoded.frozen, false);
  assert.equal(decoded.bump, 253);
});

test("fetches and decodes the tip through Solana JSON-RPC", async () => {
  const info = await fixture();
  let request;
  const result = await fetchTcapTinTipV1({
    rpcUrl: "https://rpc.example.invalid",
    address,
    expectedProgramId: owner,
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result: { value: info } }) };
    },
  });
  assert.equal(request.method, "getAccountInfo");
  assert.equal(request.params[0], address);
  assert.equal(result.sequence, 9n);
});

test("rejects a wrong program owner", async () => {
  const info = await fixture();
  assert.throws(() => decodeTcapTinTipV1Account(address, { ...info, owner: "Wrong111111111111111111111111111111111111111" }, owner), /tip_account_owner_mismatch/);
});
