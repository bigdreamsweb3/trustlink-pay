import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import { PublicKey } from "@solana/web3.js";
import ts from "../../tsn-protocol/sdks/tsn-sdk/node_modules/typescript/lib/typescript.js";
import * as sdk from "../../tsn-protocol/sdks/tsn-sdk/dist/index.js";

// Execute the actual XP handlers without opening ports, accessing wallets,
// submitting transactions, or contacting Receiver/Solana.
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

const serverHandler = await sourceFunction("../../protocol-tests/ui/server.mjs", "handleApi");
const browserHandler = await sourceFunction("../../protocol-tests/ui/public/tsn-dapp.js", "prepareTinIdentity");
const hex = value => Buffer.from(value).toString("hex");
const owner = new PublicKey(new Uint8Array(32).fill(7));
const scan = sdk.encodeBabyJubKeyV1(sdk.deriveGpruBalanceScanKeyV1(new Uint8Array(32).fill(8)).publicKey);
const elgamal = new Uint8Array(32).fill(9);
const ownerSeed = {
  resourceCommitment: "ab".repeat(32),
  encryptedMasterSeed: new Uint8Array(40).fill(10),
  gpruElgamalKeyVersion: 1,
  gpruElgamalPublicKey: elgamal,
  gpruElgamalKeyCommitment: sdk.deriveGpruElgamalKeyCommitment(1, elgamal),
  gpruBalanceScanKeyVersion: 1,
  gpruBalanceScanPublicKeyX: scan.x,
  gpruBalanceScanPublicKeyY: scan.y,
};

function serverHarness() {
  const state = { wallet: owner.toBase58(), csrfToken: "synthetic-test-token" };
  let rpcReads = 0;
  const handler = vm.runInNewContext(`${serverHandler}\nhandleApi`, {
    port: 4317, Buffer, PublicKey, randomBytes, randomInt, randomUUID,
    getSession: () => state,
    readJson: async req => req.body,
    json: (res, status, body) => Object.assign(res, { status, body }),
    tsnSdk: { ...sdk, prepareTinV1OwnerSeedAccess: async () => ({ message: "Synthetic owner approval", resourceCommitment: ownerSeed.resourceCommitment }) },
    requireTinLookupSecret: () => "synthetic-xp-test-lookup-secret-32-bytes",
    resolveRpcUrl: async () => "http://127.0.0.1:1",
    Connection: class { async getAccountInfo() { rpcReads++; return null; } },
    tinProgramId: "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT",
    makeTinIssuanceProof: () => "cd".repeat(32),
  });
  return {
    state,
    rpcReads: () => rpcReads,
    async prepare(body) {
      const response = {};
      await handler({ method: "POST", headers: { "x-trustlink-csrf": state.csrfToken }, body }, response, { pathname: "/api/tsn/sdk/prepare-tin" });
      return response;
    },
  };
}

const keyPayload = () => ({
  displayName: "Synthetic Owner",
  resourceCommitment: ownerSeed.resourceCommitment,
  encryptedMasterSeed: Buffer.from(ownerSeed.encryptedMasterSeed).toString("base64"),
  gpruElgamalKeyVersion: 1,
  gpruElgamalPublicKey: hex(ownerSeed.gpruElgamalPublicKey),
  gpruElgamalKeyCommitment: hex(ownerSeed.gpruElgamalKeyCommitment),
  gpruBalanceScanKeyVersion: 1,
  gpruBalanceScanPublicKeyX: hex(scan.x),
  gpruBalanceScanPublicKeyY: hex(scan.y),
});

test("XP browser carries owner scan keys through recovery and the real SDK creation builder", async () => {
  const server = serverHarness();
  const logs = [];
  let submitted;
  const resultElement = {};
  const prepare = vm.runInNewContext(`${browserHandler}\nprepareTinIdentity`, {
    activeWallet: { publicKey: owner },
    $: id => id === "tinDisplayName" ? { value: "Synthetic Owner" } : resultElement,
    log: (...args) => logs.push(args),
    createTinV1OwnerEnvelope: async () => ownerSeed,
    encodeBase64: bytes => Buffer.from(bytes).toString("base64"),
    bytesToHex: hex, TextEncoder,
    signBytes: async () => "synthetic-owner-signature",
    encryptTinRecovery: async () => Buffer.alloc(60, 11).toString("base64"),
    watchTinFinalization: async () => {},
    api: async (url, options) => {
      const body = JSON.parse(options.body);
      if (url.endsWith("submit-tin")) { submitted = body; return { operationId: "synthetic-operation" }; }
      const response = await server.prepare(body);
      if (response.status !== 200) throw new Error(response.body.error);
      return response.body;
    },
  });
  await prepare();
  assert.equal(logs.some(([event]) => event === "TIN IDENTITY BLOCKED"), false);
  assert.ok(submitted, "Browser must reach owner-intent submission");
  assert.equal(submitted.gpruBalanceScanKeyVersion, 1);
  assert.equal(submitted.gpruBalanceScanPublicKeyX, hex(scan.x));
  assert.equal(submitted.gpruBalanceScanPublicKeyY, hex(scan.y));
  const built = server.state.preparedTin.built;
  assert.equal(built.instructionData[0], 17);
  assert.deepEqual(built.intentHash, sdk.createTinV1OwnerIntentHash(built));
  assert.notDeepEqual(built.intentHash, sdk.createTinV1OwnerIntentHash({ ...built, gpruBalanceScanPublicKeyX: Buffer.alloc(32, 12) }));
});

test("XP rejects missing scan keys before TIN reservation even with a valid ElGamal commitment", async () => {
  const server = serverHarness();
  await server.prepare({ displayName: "Synthetic Owner" });
  const body = keyPayload();
  delete body.gpruBalanceScanKeyVersion;
  delete body.gpruBalanceScanPublicKeyX;
  delete body.gpruBalanceScanPublicKeyY;
  const response = await server.prepare(body);
  assert.equal(response.status, 422);
  assert.equal(response.body.error, "VERSIONED_GPRU_BALANCE_SCAN_KEY_REQUIRED");
  assert.equal(server.rpcReads(), 0);
});

test("XP rejects non-curve scan coordinates before TIN reservation", async () => {
  const server = serverHarness();
  await server.prepare({ displayName: "Synthetic Owner" });
  const response = await server.prepare({ ...keyPayload(), gpruBalanceScanPublicKeyX: "01".repeat(32), gpruBalanceScanPublicKeyY: "02".repeat(32) });
  assert.equal(response.status, 422);
  assert.equal(response.body.error, "GPRU_BALANCE_SCAN_PUBLIC_KEY_INVALID");
  assert.equal(server.rpcReads(), 0);
});
