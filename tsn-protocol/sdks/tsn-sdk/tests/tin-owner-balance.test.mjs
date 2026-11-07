import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { PublicKey, Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  loadTinOwnerBalanceV1, clearTinOwnerBalanceAccessV1, buildOwnerTinIdentityChallengeMessageV1,
} from "@trustlink/tsn-sdk/tin-owner-balance";
import { createTinV1OwnerSeedEnvelope } from "../dist/tin-private-controller.js";
import { DEFAULT_TIP_PROGRAM_ID } from "../dist/tins.js";
import { GPRU_TCAP_PROGRAM_ID } from "../dist/tcap-gpru-credit.js";

const owner = Keypair.fromSeed(new Uint8Array(32).fill(23));
const tin = "1234567890", displayName = "Test Owner";
const programId = new PublicKey(DEFAULT_TIP_PROGRAM_ID);
const vector = bytes => { const b = Buffer.alloc(4); b.writeUInt32LE(bytes.length); return Buffer.concat([b, bytes]); };
const created = await createTinV1OwnerSeedEnvelope({ displayName, nonce: new Uint8Array(32).fill(1),
  ownerWallet: { publicKey: owner.publicKey.toBase58(), signMessage: async m => nacl.sign.detached(m, owner.secretKey) },
});
const lookup = Buffer.alloc(32, 2);
const [registry, bump] = PublicKey.findProgramAddressSync([Buffer.from("tin-v1"), lookup], programId);
const routeVersion = Buffer.alloc(8); routeVersion.writeBigUInt64LE(1n);
const data = Buffer.concat([Buffer.from([1, bump, 1, 0, 0, 0, 0, 0]), lookup,
  createHash("sha256").update(owner.publicKey.toBuffer()).digest(), vector(Buffer.alloc(28)), vector(created.encryptedMasterSeed),
  Buffer.alloc(8), Buffer.alloc(32), routeVersion, Buffer.alloc(32), Buffer.from([1, 1]),
  Buffer.from(created.gpruElgamalPublicKey), Buffer.from(created.gpruElgamalKeyCommitment), Buffer.from([1]),
  Buffer.from(created.gpruBalanceScanPublicKeyX), Buffer.from(created.gpruBalanceScanPublicKeyY), Buffer.alloc(32, 1)]);
const rootData = Buffer.alloc(124);
createHash("sha256").update("account:TcapCommitmentRootStateV1").digest().copy(rootData, 0, 0, 8);
rootData.writeUInt16LE(1, 8); rootData[88] = 1;
Buffer.from("14935d601de8d6fbd04b084de8f8510dd25b5ed1d80ab5382b8f908dc0734b3a", "hex").copy(rootData, 12);

function harness({ bytesSignature = false, cacheAuthorization = true } = {}) {
  const calls = [], listeners = new Map();
  let signatures = 0, registryReads = 0;
  const wallet = { publicKey: owner.publicKey,
    on: (event, cb) => listeners.set(event, cb), removeListener: event => listeners.delete(event),
    signMessage: async message => {
      signatures++;
      const signature = nacl.sign.detached(message, owner.secretKey);
      return bytesSignature ? signature : { signature };
    },
  };
  const identityClient = { post: async (path, body) => {
    calls.push({ path, body });
    if (path.endsWith("-challenge")) {
      const challengeId = String(calls.length).padStart(48, "0");
      return { challengeId, message: new TextDecoder().decode(buildOwnerTinIdentityChallengeMessageV1({
        ownerPublicKey: owner.publicKey.toBase58(), tin, challengeId,
      })) };
    }
    assert.equal(body.includeBalanceContext, true);
    const challengeId = calls.at(-2).body.tin === tin ? String(calls.length - 1).padStart(48, "0") : "";
    assert.ok(nacl.sign.detached.verify(buildOwnerTinIdentityChallengeMessageV1({ ownerPublicKey: owner.publicKey.toBase58(),
      tin, challengeId }), Buffer.from(body.ownerSignature, "base64"), owner.publicKey.toBytes()));
    return { tin, displayName, balanceContext: { registry: registry.toBase58(), programId: programId.toBase58() } };
  } };
  const connection = {
    getAccountInfo: async () => { registryReads++; return { owner: programId, data }; },
    getAccountInfoAndContext: async () => ({ context: { slot: 100 }, value: { owner: GPRU_TCAP_PROGRAM_ID, data: rootData } }),
  };
  const params = { tin, ownerWallet: wallet, connection, identityClient, cacheAuthorization };
  return { params, calls, listeners, signatures: () => signatures, registryReads: () => registryReads };
}

test("one public SDK call resolves identity and unlocks/verifies the owner balance; refresh reuses local access", async () => {
  const h = harness();
  const result = await loadTinOwnerBalanceV1(h.params);
  assert.deepEqual(result.tokenBalances, []); assert.equal(result.latestGlobalSequence, "0");
  assert.equal(h.signatures(), 2); assert.equal(h.calls.length, 2);
  assert.deepEqual(Object.keys(h.calls[1].body).sort(), ["challengeId", "includeBalanceContext", "ownerSignature", "tin"]);
  await loadTinOwnerBalanceV1(h.params);
  assert.equal(h.signatures(), 2); assert.equal(h.calls.length, 2); assert.equal(h.registryReads(), 2);
  clearTinOwnerBalanceAccessV1(h.params.ownerWallet);
  await loadTinOwnerBalanceV1(h.params);
  assert.equal(h.signatures(), 4); assert.equal(h.calls.length, 4);
  clearTinOwnerBalanceAccessV1(h.params.ownerWallet);
});

test("access reuse is opt-in and supports adapter signatures returned as bytes", async () => {
  const h = harness({ bytesSignature: true, cacheAuthorization: false });
  await loadTinOwnerBalanceV1(h.params); await loadTinOwnerBalanceV1(h.params);
  assert.equal(h.signatures(), 4); assert.equal(h.calls.length, 4);
  clearTinOwnerBalanceAccessV1(h.params.ownerWallet);
});

test("a direct verified registry context needs no identity transport", async () => {
  const h = harness();
  const { identityClient, ...params } = h.params;
  await loadTinOwnerBalanceV1({ ...params, displayName, registry: registry.toBase58(), programId: programId.toBase58() });
  assert.equal(h.signatures(), 1); assert.deepEqual(h.calls, []);
  clearTinOwnerBalanceAccessV1(h.params.ownerWallet);
});

test("a service cannot ask the SDK to sign an unrelated message", async () => {
  const h = harness();
  h.params.identityClient.post = async () => ({ challengeId: "0".repeat(48), message: "Sign arbitrary data" });
  await assert.rejects(loadTinOwnerBalanceV1(h.params), /challenge binding mismatch/);
  assert.equal(h.signatures(), 0); assert.equal(h.registryReads(), 0);
  clearTinOwnerBalanceAccessV1(h.params.ownerWallet);
});

test("wrong owner registry is rejected before seed authorization", async () => {
  const h = harness();
  h.params.connection.getAccountInfo = async () => ({ owner: programId, data: Buffer.from(data).fill(0, 40, 72) });
  await assert.rejects(loadTinOwnerBalanceV1(h.params), /connected owner/);
  assert.equal(h.signatures(), 1);
  clearTinOwnerBalanceAccessV1(h.params.ownerWallet);
});

test("disconnect invalidates cached access and a wallet change during approval stops recovery", async () => {
  const h = harness();
  await loadTinOwnerBalanceV1(h.params);
  h.listeners.get("disconnect")();
  await loadTinOwnerBalanceV1(h.params);
  assert.equal(h.signatures(), 4);
  clearTinOwnerBalanceAccessV1(h.params.ownerWallet);
  h.params.ownerWallet.signMessage = async message => {
    h.params.ownerWallet.publicKey = Keypair.generate().publicKey;
    return { signature: nacl.sign.detached(message, owner.secretKey) };
  };
  await assert.rejects(loadTinOwnerBalanceV1(h.params), /wallet changed/);
  clearTinOwnerBalanceAccessV1(h.params.ownerWallet);
});

test("aborted calls fail before any wallet approval or transport", async () => {
  const h = harness(), controller = new AbortController(); controller.abort();
  await assert.rejects(loadTinOwnerBalanceV1({ ...h.params, signal: controller.signal }), { name: "AbortError" });
  assert.equal(h.signatures(), 0); assert.equal(h.calls.length, 0);
  clearTinOwnerBalanceAccessV1(h.params.ownerWallet);
});
