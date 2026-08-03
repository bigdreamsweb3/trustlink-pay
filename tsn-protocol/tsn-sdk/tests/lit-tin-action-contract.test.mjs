import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertSafeLitTinActionRequest,
  createLitTinProtectKeyRequest,
  createLitTinReleaseKeyRequest,
} from "../dist/lit-tin-action-contract.js";

const proof = {
  version: "tsn-tin-device-access-proof",
  domain: "TSN_TIN_DEVICE_THRESHOLD_ACCESS",
  operation: "PROTECT_KEY",
  tin: "1000000008",
  ownerPublicKey: "owner",
  routeVersion: 1,
  pruConfigurationHash: "1".repeat(64),
  deviceSessionBinding: "session:device:signing:encryption:key",
  deviceId: "device",
  deviceSigningKeyFingerprint: "2".repeat(64),
  deviceSigningPublicKey: { kty: "OKP", crv: "Ed25519", x: "public" },
  deviceEncryptionKeyFingerprint: "3".repeat(64),
  deviceEncryptionPublicKey: { kty: "OKP", crv: "X25519", x: "public" },
  walletAuthorizationCommitment: "4".repeat(64),
  resourceCommitment: "5".repeat(64),
  requestNonce: "nonce",
  issuedAt: "2026-07-30T00:00:00.000Z",
  expiresAt: "2026-07-30T00:05:00.000Z",
  signatureBase64Url: "signature",
};

const access = {
  tin: proof.tin,
  ownerPublicKey: proof.ownerPublicKey,
  routeVersion: proof.routeVersion,
  pruConfigurationHash: proof.pruConfigurationHash,
  deviceSessionBinding: proof.deviceSessionBinding,
  walletAuthorizationMessage: new Uint8Array([1, 2, 3]),
  walletAuthorizationSignature: new Uint8Array([4, 5, 6]),
  deviceAccessProof: proof,
  resourceCommitment: proof.resourceCommitment,
};

test("protect-key wire request contains only public proofs and no seed or key material", () => {
  const request = createLitTinProtectKeyRequest({ pkpId: "pkp", access });
  const serialized = JSON.stringify(request).toLowerCase();
  assert.equal(serialized.includes("masterseed"), false);
  assert.equal(serialized.includes("seedciphertext"), false);
  assert.equal(serialized.includes("keymaterial"), false);
  assert.equal(serialized.includes("privatekey"), false);
  assert.equal(serialized.includes("apikey"), false);
  assertSafeLitTinActionRequest(request);
});

test("release-key wire request carries only the protected key record", () => {
  const request = createLitTinReleaseKeyRequest({
    pkpId: "pkp",
    access: {
      ...access,
      deviceAccessProof: { ...proof, operation: "RELEASE_KEY" },
    },
    protectedKey: "opaque-pkp-ciphertext",
    protectedKeyCommitment: "6".repeat(64),
    accessControlHash: "7".repeat(64),
  });
  assert.equal(request.protectedKey, "opaque-pkp-ciphertext");
  assertSafeLitTinActionRequest(request);
});

test("wire guard rejects accidental secret-bearing fields", () => {
  assert.throws(
    () => assertSafeLitTinActionRequest({
      domain: "TSN_TIN_THRESHOLD_KEY_ACTION",
      operation: "PROTECT_KEY",
      masterSeed: "unsafe",
    }),
    /forbidden field/,
  );
  assert.throws(
    () => assertSafeLitTinActionRequest({
      domain: "TSN_TIN_THRESHOLD_KEY_ACTION",
      operation: "PROTECT_KEY",
      nested: { apiKey: "unsafe" },
    }),
    /forbidden field/,
  );
});
