import assert from "node:assert/strict";
import { test } from "node:test";

import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";

import {
  createTinPrivateIdentity,
  unlockTinPrivateRoute,
} from "../dist/tin-private-controller.js";
import {
  decodeTinMasterSeedEnvelope,
  serializeTinMasterSeedWalletAuthorization,
} from "../dist/tin-envelopes.js";
import {
  createTinDeviceAccessProof,
  verifyTinDeviceAccessRequest,
} from "../dist/tin-device-access.js";
import {
  fingerprintDeviceSigningPublicKey,
  fingerprintEncryptionPublicKey,
} from "../dist/device/key-fingerprints.js";
import {
  unwrapTinThresholdKeyOnDevice,
  wrapTinThresholdKeyForDevice,
} from "../dist/tin-device-key-envelope.js";
import { TsnDeviceEnvelopeTinMasterSeedProvider } from "../dist/tin-device-key-provider.js";
import { buildTinOwnerIntentMessage } from "../dist/tins.js";

test("TIN owner approval uses a deterministic printable detached message", () => {
  const message = new TextDecoder().decode(
    buildTinOwnerIntentMessage(new Uint8Array(32).fill(0xab)),
  );
  assert.equal(
    message,
    [
      "TSN TIN Upgrade",
      "---",
      "Intent Hash: abababababababababababababababababababababababababababababababab",
      "Domain: TSN_TIN_OWNER_INTENT_V1",
    ].join("\n"),
  );
  assert.equal(new TextEncoder().encode(message).length, message.length);
});

const networkStore = new Map();

function wallet(keypair = nacl.sign.keyPair()) {
  return {
    publicKey: new PublicKey(keypair.publicKey).toBase58(),
    signMessage: async (message) => nacl.sign.detached(message, keypair.secretKey),
  };
}

function thresholdProvider(deviceSessionBinding) {
  const consumedNonces = new Set();
  const verify = (params, operation) => verifyTinDeviceAccessRequest({
    expectedOperation: operation,
    expectedTin: params.tin,
    expectedOwnerPublicKey: params.ownerPublicKey,
    expectedRouteVersion: params.routeVersion,
    expectedPruConfigurationHash: params.pruConfigurationHash,
    expectedDeviceSessionBinding: params.deviceSessionBinding,
    expectedResourceCommitment: params.resourceCommitment,
    walletAuthorizationMessage: params.walletAuthorizationMessage,
    walletAuthorizationSignature: params.walletAuthorizationSignature,
    deviceAccessProof: params.deviceAccessProof,
    consumeNonce: (nonce) => {
      if (consumedNonces.has(nonce)) return false;
      consumedNonces.add(nonce);
      return true;
    },
  });
  return {
    id: "test-threshold-network",
    getDeviceSessionBinding: async () => deviceSessionBinding,
    async protectKey(params) {
      await verify(params, "PROTECT_KEY");
      assert.match(params.deviceSessionBinding, new RegExp(`^${deviceSessionBinding}:device:`));
      assert.equal(params.deviceAccessProof.operation, "PROTECT_KEY");
      assert.equal("plaintext" in params, false);
      assert.equal("keyMaterial" in params, false);
      assert.match(new TextDecoder().decode(params.walletAuthorizationMessage), new RegExp(deviceSessionBinding));
      const id = crypto.randomUUID();
      const keyMaterial = crypto.getRandomValues(new Uint8Array(32));
      networkStore.set(id, keyMaterial.slice());
      return {
        protectedKey: id,
        protectedKeyCommitment: "1".repeat(64),
        accessControlHash: "2".repeat(64),
        deviceKeyEnvelope: await wrapTinThresholdKeyForDevice({
          keyMaterial,
          proof: params.deviceAccessProof,
        }),
      };
    },
    async releaseKey(params) {
      await verify(params, "RELEASE_KEY");
      assert.match(params.deviceSessionBinding, new RegExp(`^${deviceSessionBinding}:device:`));
      assert.equal(params.deviceAccessProof.operation, "RELEASE_KEY");
      assert.match(new TextDecoder().decode(params.walletAuthorizationMessage), new RegExp(deviceSessionBinding));
      const keyMaterial = networkStore.get(params.protectedKey);
      if (!keyMaterial) throw new Error("Threshold-protected key unavailable");
      return wrapTinThresholdKeyForDevice({
        keyMaterial,
        proof: params.deviceAccessProof,
      });
    },
  };
}

async function authorizedDevice(deviceId = crypto.randomUUID()) {
  const keyPair = await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]);
  const signingPublicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const encryptionKeyPair = await crypto.subtle.generateKey("X25519", false, ["deriveBits"]);
  const encryptionPublicKey = await crypto.subtle.exportKey("jwk", encryptionKeyPair.publicKey);
  const device = {
    deviceId,
    signingPublicKey,
    signingKeyFingerprint: await fingerprintDeviceSigningPublicKey(signingPublicKey),
    encryptionPublicKey,
    encryptionKeyFingerprint: await fingerprintEncryptionPublicKey(
      encryptionPublicKey,
      "device",
    ),
    _encryptionPrivateKey: encryptionKeyPair.privateKey,
    signMessage: async (message) =>
      new Uint8Array(await crypto.subtle.sign("Ed25519", keyPair.privateKey, message)),
  };
  return {
    ...device,
    unwrapThresholdKey: (envelope, proof) =>
      unwrapTinThresholdKeyOnDevice({
        envelope,
        proof,
        deviceEncryptionPrivateKey: encryptionKeyPair.privateKey,
      }),
  };
}

async function accessRequest(overrides = {}) {
  const ownerKeys = nacl.sign.keyPair();
  const ownerPublicKey = new PublicKey(ownerKeys.publicKey).toBase58();
  const device = await authorizedDevice("device-proof");
  const thresholdBinding =
    `threshold-session:device:${device.signingKeyFingerprint}` +
    `:encryption:${device.encryptionKeyFingerprint}`;
  const resourceCommitment = "b".repeat(64);
  const identity = {
    tin: "1000000008",
    ownerPublicKey,
    routeVersion: 3,
    pruConfigurationHash: "a".repeat(64),
    resourceCommitment,
    deviceSessionBinding: thresholdBinding,
  };
  const walletAuthorizationMessage = serializeTinMasterSeedWalletAuthorization(identity);
  const walletAuthorizationSignature = nacl.sign.detached(
    walletAuthorizationMessage,
    ownerKeys.secretKey,
  );
  const deviceAccessProof = await createTinDeviceAccessProof({
    operation: "RELEASE_KEY",
    ...identity,
    walletAuthorizationMessage,
    resourceCommitment,
    device,
    ...overrides.proof,
  });
  return {
    expectedOperation: "RELEASE_KEY",
    expectedTin: identity.tin,
    expectedOwnerPublicKey: identity.ownerPublicKey,
    expectedRouteVersion: identity.routeVersion,
    expectedPruConfigurationHash: identity.pruConfigurationHash,
    expectedDeviceSessionBinding: identity.deviceSessionBinding,
    expectedResourceCommitment: resourceCommitment,
    walletAuthorizationMessage,
    walletAuthorizationSignature,
    deviceAccessProof,
    ...overrides.request,
  };
}

function routingPublicKey() {
  return Buffer.from(nacl.box.keyPair().publicKey).toString("base64");
}

test("SDK creates seed, PRUs, commitments, and both envelopes without exposing seed", async () => {
  const owner = wallet();
  const result = await createTinPrivateIdentity({
    tin: "1000000008",
    routeVersion: 1,
    routeNonce: "3".repeat(64),
    ownerWallet: owner,
    authorizedDevice: await authorizedDevice("device-a"),
    thresholdProvider: thresholdProvider("device-session-a"),
    nodeRoutingPublicKeyBase64: routingPublicKey(),
  });
  const envelope = decodeTinMasterSeedEnvelope(result.encryptedMasterSeed);
  assert.equal(result.publicRoute.prus.length, 30);
  assert.equal(envelope.ownerPublicKey, owner.publicKey);
  assert.equal(envelope.pruConfigurationHash, result.pruConfigurationHash);
  assert.equal("deviceId" in envelope, false);
  assert.equal("deviceSessionBinding" in envelope, false);
  assert.equal(JSON.stringify(envelope).includes("masterSeed"), false);
  assert.equal("plaintext" in envelope, false);
  assert.ok(envelope.seedCiphertext);
  assert.ok(envelope.protectedKey);
});

test("device-envelope provider unlocks only the device that received the envelope", async () => {
  const owner = wallet();
  const device = await authorizedDevice("device-envelope-a");
  const created = await createTinPrivateIdentity({
    tin: "1000000008",
    routeVersion: 1,
    routeNonce: "6".repeat(64),
    ownerWallet: owner,
    authorizedDevice: device,
    thresholdProvider: new TsnDeviceEnvelopeTinMasterSeedProvider("session-a"),
    nodeRoutingPublicKeyBase64: routingPublicKey(),
  });
  const unlocked = await unlockTinPrivateRoute({
    tin: "1000000008",
    pruConfigurationHash: created.pruConfigurationHash,
    envelope: created.encryptedMasterSeed,
    ownerWallet: owner,
    authorizedDevice: device,
    thresholdProvider: new TsnDeviceEnvelopeTinMasterSeedProvider("session-b"),
  });
  assert.deepEqual(unlocked.prus, created.publicRoute.prus);
  await assert.rejects(
    unlockTinPrivateRoute({
      tin: "1000000008",
      pruConfigurationHash: created.pruConfigurationHash,
      envelope: created.encryptedMasterSeed,
      ownerWallet: owner,
      authorizedDevice: await authorizedDevice("device-envelope-b"),
      thresholdProvider: new TsnDeviceEnvelopeTinMasterSeedProvider("session-c"),
    }),
    /legacy single-device envelope|multi-device TSN threshold key-release provider/,
  );
});

test("a newly authorized device can unlock after a fresh main-wallet signature", async () => {
  const owner = wallet();
  const created = await createTinPrivateIdentity({
    tin: "1000000008",
    routeVersion: 1,
    routeNonce: "4".repeat(64),
    ownerWallet: owner,
    authorizedDevice: await authorizedDevice("device-a"),
    thresholdProvider: thresholdProvider("device-session-a"),
    nodeRoutingPublicKeyBase64: routingPublicKey(),
  });
  const unlocked = await unlockTinPrivateRoute({
    tin: "1000000008",
    pruConfigurationHash: created.pruConfigurationHash,
    envelope: created.encryptedMasterSeed,
    ownerWallet: owner,
    authorizedDevice: await authorizedDevice("device-b"),
    thresholdProvider: thresholdProvider("device-session-b"),
  });
  assert.deepEqual(unlocked.prus, created.publicRoute.prus);
});

test("a captured authorization from another device session is rejected", async () => {
  const ownerKeys = nacl.sign.keyPair();
  const owner = wallet(ownerKeys);
  let capturedMessage;
  let capturedSignature;
  const created = await createTinPrivateIdentity({
    tin: "1000000008",
    routeVersion: 1,
    routeNonce: "5".repeat(64),
    ownerWallet: {
      ...owner,
      signMessage: async (message) => {
        capturedMessage = message.slice();
        capturedSignature = nacl.sign.detached(message, ownerKeys.secretKey);
        return capturedSignature;
      },
    },
    authorizedDevice: await authorizedDevice("device-a"),
    thresholdProvider: thresholdProvider("device-session-a"),
    nodeRoutingPublicKeyBase64: routingPublicKey(),
  });
  await assert.rejects(
    unlockTinPrivateRoute({
      tin: "1000000008",
      pruConfigurationHash: created.pruConfigurationHash,
      envelope: created.encryptedMasterSeed,
      ownerWallet: {
        publicKey: owner.publicKey,
        signMessage: async () => {
          assert.ok(capturedMessage);
          return capturedSignature;
        },
      },
      authorizedDevice: await authorizedDevice("device-b"),
      thresholdProvider: thresholdProvider("device-session-b"),
    }),
    /Main-wallet authorization is invalid/,
  );
});

test("threshold verifier accepts one exact wallet-and-device proof and rejects replay", async () => {
  const request = await accessRequest();
  const consumed = new Set();
  const consumeNonce = (nonce) => {
    if (consumed.has(nonce)) return false;
    consumed.add(nonce);
    return true;
  };
  const verified = await verifyTinDeviceAccessRequest({ ...request, consumeNonce });
  assert.equal(verified.walletPublicKey, request.expectedOwnerPublicKey);
  await assert.rejects(
    verifyTinDeviceAccessRequest({ ...request, consumeNonce }),
    /nonce was already used/,
  );
});

test("threshold verifier rejects resource, device, signature, and expiry tampering", async () => {
  const resourceTamper = await accessRequest({
    request: { expectedResourceCommitment: "c".repeat(64) },
  });
  await assert.rejects(
    verifyTinDeviceAccessRequest(resourceTamper),
    /does not match the threshold request/,
  );

  const deviceTamper = await accessRequest();
  deviceTamper.deviceAccessProof = {
    ...deviceTamper.deviceAccessProof,
    deviceSigningKeyFingerprint: "d".repeat(64),
  };
  await assert.rejects(
    verifyTinDeviceAccessRequest(deviceTamper),
    /fingerprint is invalid/,
  );

  const signatureTamper = await accessRequest();
  signatureTamper.deviceAccessProof = {
    ...signatureTamper.deviceAccessProof,
    signatureBase64Url:
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  };
  await assert.rejects(
    verifyTinDeviceAccessRequest(signatureTamper),
    /signature is invalid/,
  );

  const expired = await accessRequest({
    proof: { now: new Date(Date.now() - 6 * 60 * 1000) },
  });
  await assert.rejects(
    verifyTinDeviceAccessRequest(expired),
    /expired or has an invalid validity window/,
  );
});

test("threshold verifier rejects a different TIN or owner wallet", async () => {
  const wrongTin = await accessRequest({
    request: { expectedTin: "1000000009" },
  });
  await assert.rejects(
    verifyTinDeviceAccessRequest(wrongTin),
    /does not match the threshold request/,
  );

  const otherOwner = wallet();
  const wrongOwner = await accessRequest({
    request: { expectedOwnerPublicKey: otherOwner.publicKey },
  });
  await assert.rejects(
    verifyTinDeviceAccessRequest(wrongOwner),
    /does not match the threshold request/,
  );
});

test("threshold key release is encrypted to the exact authorized device", async () => {
  const request = await accessRequest();
  const device = await authorizedDevice("device-key-recipient");
  const deviceSessionBinding =
    `threshold-session:device:${device.signingKeyFingerprint}` +
    `:encryption:${device.encryptionKeyFingerprint}`;
  const proof = await createTinDeviceAccessProof({
    operation: "RELEASE_KEY",
    tin: request.expectedTin,
    ownerPublicKey: request.expectedOwnerPublicKey,
    routeVersion: request.expectedRouteVersion,
    pruConfigurationHash: request.expectedPruConfigurationHash,
    deviceSessionBinding,
    walletAuthorizationMessage: request.walletAuthorizationMessage,
    resourceCommitment: request.expectedResourceCommitment,
    device,
  });
  const keyMaterial = crypto.getRandomValues(new Uint8Array(32));
  const envelope = await wrapTinThresholdKeyForDevice({ keyMaterial, proof });
  const unwrapped = await unwrapTinThresholdKeyOnDevice({
    envelope,
    proof,
    deviceEncryptionPrivateKey: device._encryptionPrivateKey,
  });
  assert.deepEqual(unwrapped, keyMaterial);
  unwrapped.fill(0);

  const otherDevice = await authorizedDevice("wrong-key-recipient");
  await assert.rejects(
    unwrapTinThresholdKeyOnDevice({
      envelope,
      proof,
      deviceEncryptionPrivateKey: otherDevice._encryptionPrivateKey,
    }),
  );
  keyMaterial.fill(0);
});
