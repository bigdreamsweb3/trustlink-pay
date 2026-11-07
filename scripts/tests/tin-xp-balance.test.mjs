import assert from "node:assert/strict";
import { createHash, createPublicKey, randomBytes, verify as verifySignature, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { PublicKey, Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import ts from "../../tsn-protocol/sdks/tsn-sdk/node_modules/typescript/lib/typescript.js";
import * as sdk from "../../tsn-protocol/sdks/tsn-sdk/dist/index.js";

async function sourceFunction(file, name) {
  const source = ts.createSourceFile(file, await readFile(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let result;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(result, `Missing XP function ${name}`);
  return result;
}
const browserRefresh = await sourceFunction("../../protocol-tests/ui/public/tsn-dapp.js", "refreshTinBalance");
const browserFormat = await sourceFunction("../../protocol-tests/ui/public/tsn-dapp.js", "formatTinTokenBalance");
const handlerSource = await sourceFunction("../../protocol-tests/ui/server.mjs", "handleApi");
const challengeSource = await sourceFunction("../../protocol-tests/ui/server.mjs", "buildOwnerTinIdentityChallengeMessage");
const owner = Keypair.fromSeed(new Uint8Array(32).fill(23));
const usdc = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

function browserHarness(result, failure) {
  const elements = new Map(["overviewTinBalance", "tinBalanceStatus", "refreshTinBalance"].map(id => [id, { textContent: "Locked", disabled: false }]));
  const calls = [];
  const scope = vm.createContext({ Buffer, Uint8Array, AbortController, TextEncoder, BigInt, Error,
    $: id => elements.get(id), session: { sessionId: "test-session", csrfToken: "test-csrf" },
    activeWallet: { publicKey: owner.publicKey }, ownerTinIdentity: { tin: "1234567890", displayName: "Test Owner" },
    balanceInFlight: null, balanceController: null, ownerIdentityClient: { post() {} },
    encodeBase64: bytes => Buffer.from(bytes).toString("base64"), decodeBase64: value => new Uint8Array(Buffer.from(value, "base64")),
    signBytes: async () => Buffer.alloc(64, 3).toString("base64"), log: () => {},
    api: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) });
      return url.endsWith("challenge") ? { challengeId: "test", message: "Authorize lookup" } : { balanceContext: { registry: "test", programId: "test" } }; },
    window: { location: { origin: "http://127.0.0.1:4317" }, TsnTinCreationSdk: {
      Connection: class {}, loadTinOwnerBalanceV1: async params => {
        if (failure) throw failure;
        calls.push({ sdkParams: params });
        return result;
      },
    } },
  });
  const refresh = vm.runInContext(`${browserFormat}\n${browserRefresh}\nrefreshTinBalance`, scope);
  return { scope, refresh, elements, calls };
}
test("XP displays 1.1 USDC through one SDK call with the original wallet and transport", async () => {
  const harness = browserHarness({ tokenBalances: [{ tokenId: 1, mint: usdc, decimals: 6, balanceBaseUnits: "1100000" }], actionCount: 2 });
  await harness.refresh();
  assert.equal(harness.elements.get("overviewTinBalance").textContent, "1.1 USDC");
  assert.equal(harness.elements.get("refreshTinBalance").disabled, false);
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].sdkParams.ownerWallet, harness.scope.activeWallet);
  assert.equal(harness.calls[0].sdkParams.identityClient, harness.scope.ownerIdentityClient);
});
test("XP displays failed SDK reads as unavailable without orchestrating identity requests", async () => {
  const harness = browserHarness(null, new Error("Finalized history is incomplete"));
  await harness.refresh();
  assert.equal(harness.elements.get("overviewTinBalance").textContent, "Unavailable");
  assert.equal(harness.elements.get("tinBalanceStatus").textContent, "Finalized history is incomplete");
  assert.deepEqual(harness.calls, []);
});
test("XP formats balances using integer base units beyond JavaScript's safe integer range", () => {
  const format = vm.runInNewContext(`${browserFormat}\nformatTinTokenBalance`);
  assert.equal(format({ mint: usdc, tokenId: 1, decimals: 6, balanceBaseUnits: "18446744073709551615" }), "18446744073709.551615 USDC");
});

function serverHarness() {
  const ownerHash = createHash("sha256").update(owner.publicKey.toBuffer()).digest();
  const lookup = Buffer.alloc(32, 9), programId = new PublicKey(sdk.DEFAULT_TIP_PROGRAM_ID);
  const [registry, bump] = PublicKey.findProgramAddressSync([Buffer.from("tin-v1"), lookup], programId);
  const seed = new Uint8Array(32).fill(27), routeKey = sdk.deriveGpruElgamalPublicKey(seed);
  const scan = sdk.encodeBabyJubKeyV1(sdk.deriveGpruBalanceScanKeyV1(seed).publicKey);
  const vector = bytes => { const length = Buffer.alloc(4); length.writeUInt32LE(bytes.length); return Buffer.concat([length, bytes]); };
  const routeVersion = Buffer.alloc(8); routeVersion.writeBigUInt64LE(1n);
  const data = Buffer.concat([Buffer.from([1, bump, 1, 0, 0, 0, 0, 0]), lookup, ownerHash,
    vector(Buffer.alloc(28)), vector(Buffer.alloc(20)), Buffer.alloc(8), Buffer.alloc(32), routeVersion, Buffer.alloc(32),
    Buffer.from([1, 1]), Buffer.from(routeKey), Buffer.from(sdk.deriveGpruElgamalKeyCommitment(1, routeKey)),
    Buffer.from([1]), scan.x, scan.y, Buffer.alloc(32, 1)]);
  const session = { wallet: owner.publicKey.toBase58(), csrfToken: "test-csrf" };
  let reads = 0;
  const handler = vm.runInNewContext(`${challengeSource}\n${handlerSource}\nhandleApi`, {
    port: 4317, Buffer, PublicKey, randomBytes, createHash, createPublicKey, verifySignature, tinProgramId: programId.toBase58(), tsnSdk: sdk,
    getSession: () => session, readJson: async req => req.body, json: (res, status, body) => Object.assign(res, { status, body }),
    resolveRpcUrl: async () => "http://127.0.0.1:1", Connection: class { async getAccountInfo() { reads++; return { owner: programId, data }; } },
    resolveTinIdentityFromSdk: async () => ({ registryPda: registry.toBase58(), displayName: "Test Owner", ownerPubkeyHash: ownerHash.toString("hex") }),
  });
  const request = async (path, body) => { const res = {}; await handler({ method: "POST", headers: { "x-trustlink-csrf": session.csrfToken }, body }, res, { pathname: path }); return res; };
  return { session, registry, request, reads: () => reads };
}
test("XP requires a valid one-time owner signature before returning the canonical balance registry", async () => {
  const harness = serverHarness();
  let challenge = await harness.request("/api/tsn/sdk/owner-tin-identity-challenge", { tin: "1234567890" });
  let result = await harness.request("/api/tsn/sdk/owner-tin-identity", { tin: "1234567890", challengeId: challenge.body.challengeId,
    ownerSignature: Buffer.alloc(64).toString("base64"), includeBalanceContext: true });
  assert.equal(result.status, 401); assert.equal(harness.reads(), 0);
  challenge = await harness.request("/api/tsn/sdk/owner-tin-identity-challenge", { tin: "1234567890" });
  const signature = nacl.sign.detached(Buffer.from(challenge.body.message), owner.secretKey);
  const body = { tin: "1234567890", challengeId: challenge.body.challengeId, ownerSignature: Buffer.from(signature).toString("base64"), includeBalanceContext: true };
  result = await harness.request("/api/tsn/sdk/owner-tin-identity", body);
  assert.equal(result.status, 200);
  assert.equal(result.body.balanceContext.registry, harness.registry.toBase58());
  assert.deepEqual(Object.keys(result.body.balanceContext).sort(), ["programId", "registry"]);
  assert.equal((await harness.request("/api/tsn/sdk/owner-tin-identity", body)).status, 401);
});
test("rebuilt XP browser bundle initializes synchronous WASM and recovers an unopened zero-history TIN locally", async () => {
  const context = vm.createContext({ console, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Uint16Array, Uint32Array,
    Int32Array, BigInt64Array, BigUint64Array, Float32Array, Float64Array, ArrayBuffer, DataView, Buffer, WebAssembly, URL, atob, btoa,
    setTimeout, clearTimeout, setInterval, clearInterval, AbortController, AbortSignal });
  vm.runInContext(await readFile(new URL("../../protocol-tests/ui/public/tsn-tin-creation-sdk.bundle.js", import.meta.url), "utf8"), context);
  assert.equal(typeof context.TsnTinCreationSdk.loadTinOwnerBalanceV1, "function");
  const created = await context.TsnTinCreationSdk.createTinV1OwnerSeedEnvelope({ ownerWallet: { publicKey: owner.publicKey.toBase58(),
    signMessage: async message => nacl.sign.detached(message, owner.secretKey) }, displayName: "Test Owner", nonce: new Uint8Array(32).fill(1) });
  assert.ok(created.encryptedMasterSeed.length > 0);
  const programId = new PublicKey(sdk.DEFAULT_TIP_PROGRAM_ID), lookup = Buffer.alloc(32, 2);
  const [registry, bump] = PublicKey.findProgramAddressSync([Buffer.from("tin-v1"), lookup], programId);
  const ownerHash = createHash("sha256").update(owner.publicKey.toBuffer()).digest();
  const vector = bytes => { const length = Buffer.alloc(4); length.writeUInt32LE(bytes.length); return Buffer.concat([length, bytes]); };
  const routeVersion = Buffer.alloc(8); routeVersion.writeBigUInt64LE(1n);
  const data = Buffer.concat([Buffer.from([1, bump, 1, 0, 0, 0, 0, 0]), lookup, ownerHash,
    vector(Buffer.alloc(28)), vector(created.encryptedMasterSeed), Buffer.alloc(8), Buffer.alloc(32), routeVersion, Buffer.alloc(32),
    Buffer.from([1, 1]), Buffer.from(created.gpruElgamalPublicKey), Buffer.from(created.gpruElgamalKeyCommitment),
    Buffer.from([1]), Buffer.from(created.gpruBalanceScanPublicKeyX), Buffer.from(created.gpruBalanceScanPublicKeyY), Buffer.alloc(32, 1)]);
  const rootData = Buffer.alloc(124);
  createHash("sha256").update("account:TcapCommitmentRootStateV1").digest().copy(rootData, 0, 0, 8);
  rootData.writeUInt16LE(1, 8); rootData[88] = 1;
  Buffer.from("14935d601de8d6fbd04b084de8f8510dd25b5ed1d80ab5382b8f908dc0734b3a", "hex").copy(rootData, 12);
  const result = await context.TsnTinCreationSdk.loadTinOwnerBalanceV1({ connection: {
    getAccountInfo: async () => ({ owner: programId, data }),
    getAccountInfoAndContext: async () => ({ context: { slot: 100 }, value: { owner: sdk.GPRU_TCAP_PROGRAM_ID, data: rootData } }),
  }, registry: registry.toBase58(), programId: programId.toBase58(), tin: "1234567890", displayName: "Test Owner",
    ownerWallet: { publicKey: owner.publicKey.toBase58(), signMessage: async message => nacl.sign.detached(message, owner.secretKey) } });
  assert.equal(result.latestGlobalSequence, "0"); assert.equal(result.actionCount, 0); assert.equal(result.tokenBalances.length, 0);
});
