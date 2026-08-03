import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

import { unwrapTinThresholdKeyOnDevice } from "../dist/tin-device-key-envelope.js";

const source = await readFile(new URL("../lit-actions/tin-threshold-key-action.js", import.meta.url), "utf8");
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const canonical = (fields) => new TextEncoder().encode(
  fields.map((field) => `${String(field).length}:${String(field)}`).join("|"),
);

async function fixture({ corruptReceipt = false } = {}) {
  const verifier = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const verifierPublic = new Uint8Array(await crypto.subtle.exportKey("raw", verifier.publicKey));
  const device = await crypto.subtle.generateKey("X25519", true, ["deriveBits"]);
  const devicePublic = await crypto.subtle.exportKey("jwk", device.publicKey);
  const expiresAt = new Date(Date.now() + 120_000).toISOString();
  const proof = {
    operation: "PROTECT_KEY",
    tin: "1000000008",
    ownerPublicKey: "owner-public-key",
    routeVersion: 1,
    pruConfigurationHash: "1".repeat(64),
    resourceCommitment: "2".repeat(64),
    deviceSessionBinding: "session",
    deviceId: "device",
    deviceSigningKeyFingerprint: "3".repeat(64),
    deviceEncryptionKeyFingerprint: "4".repeat(64),
    deviceEncryptionPublicKey: devicePublic,
    walletAuthorizationCommitment: "5".repeat(64),
    requestNonce: "request-nonce",
    expiresAt,
  };
  const request = {
    domain: "TSN_TIN_THRESHOLD_KEY_ACTION",
    operation: "PROTECT_KEY",
    pkpId: "pkp",
    access: {
      tin: proof.tin,
      ownerPublicKey: proof.ownerPublicKey,
      resourceCommitment: proof.resourceCommitment,
    },
    deviceAccessProof: proof,
  };
  const unsignedReceipt = {
    domain: "TSN_TIN_THRESHOLD_NONCE_RECEIPT",
    operation: proof.operation,
    tin: proof.tin,
    ownerPublicKey: proof.ownerPublicKey,
    resourceCommitment: proof.resourceCommitment,
    requestNonce: proof.requestNonce,
    consumedAt: new Date().toISOString(),
    expiresAt,
    verifierPublicKeyBase64Url: b64url(verifierPublic),
  };
  const signature = new Uint8Array(await crypto.subtle.sign(
    "Ed25519",
    verifier.privateKey,
    canonical(Object.values(unsignedReceipt)),
  ));
  if (corruptReceipt) signature[0] ^= 1;
  return {
    request,
    proof,
    devicePrivateKey: device.privateKey,
    verifierPublicKeyBase64Url: b64url(verifierPublic),
    receipt: { ...unsignedReceipt, signatureBase64Url: b64url(signature) },
  };
}

async function executeAction(data) {
  let encryptionCalls = 0;
  const responsePromise = new Promise((resolve) => {
    const context = {
      request: data.request,
      replayEndpoint: "https://node.example/threshold-access/nonces/consume",
      verifierPublicKeyBase64Url: data.verifierPublicKeyBase64Url,
      crypto,
      TextEncoder,
      Uint8Array,
      Error,
      JSON,
      Date,
      String,
      Array,
      btoa,
      atob,
      fetch: async () => ({ ok: true, status: 200, json: async () => data.receipt }),
      Lit: {
        Actions: {
          Encrypt: async () => { encryptionCalls += 1; return "opaque-pkp-ciphertext"; },
          Decrypt: async () => { throw new Error("unexpected decrypt"); },
          setResponse: ({ response }) => resolve(JSON.parse(response)),
        },
      },
    };
    vm.runInNewContext(source, context);
  });
  return { response: await responsePromise, encryptionCalls };
}

test("immutable action wraps its random data key to the authorized device", async () => {
  const data = await fixture();
  const { response, encryptionCalls } = await executeAction(data);
  assert.equal(encryptionCalls, 1);
  assert.equal(response.operation, "PROTECT_KEY");
  const key = await unwrapTinThresholdKeyOnDevice({
    envelope: response.deviceKeyEnvelope,
    proof: data.proof,
    deviceEncryptionPrivateKey: data.devicePrivateKey,
  });
  assert.equal(key.length, 32);
  key.fill(0);
});

test("immutable action rejects a forged Node receipt before PKP encryption", async () => {
  const data = await fixture({ corruptReceipt: true });
  const { response, encryptionCalls } = await executeAction(data);
  assert.equal(encryptionCalls, 0);
  assert.match(response.error, /receipt signature is invalid/);
});
