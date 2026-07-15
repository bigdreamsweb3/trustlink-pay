import test from "node:test";
import assert from "node:assert/strict";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";

import {
  TSN_DEVICE_AUTHORIZATION_DOMAIN,
  TSN_DEVICE_AUTHORIZATION_VERSION,
  serializeDeviceAuthorization,
} from "../dist/authorization/index.js";
import {
  verifyTransientOwnerAuthorization,
} from "../dist/authorization/server/index.js";
import {
  TSN_SESSION_PROOF_DOMAIN,
  TSN_SESSION_PROOF_VERSION,
  createRequestBodyCommitment,
  generateNonExportableDeviceSigningCredential,
  signSessionProof,
  verifySessionProof,
} from "../dist/sessions/proof-of-possession.js";

function createOwnerAuthorization(overrides = {}) {
  const owner = nacl.sign.keyPair();
  const authorization = {
    protocolVersion: TSN_DEVICE_AUTHORIZATION_VERSION,
    domain: TSN_DEVICE_AUTHORIZATION_DOMAIN,
    network: "devnet",
    tinCommitment: "tin-commitment",
    ownerIdentityCommitment: "owner-commitment",
    deviceSigningKeyFingerprint: "signing-fingerprint",
    deviceEncryptionKeyFingerprint: "encryption-fingerprint",
    permissions: ["private-history:read", "private-receipt:read"],
    historyRecoveryScope: "all",
    nonce: "owner-nonce",
    issuedAt: "2026-07-14T10:00:00.000Z",
    expiresAt: "2026-07-14T10:10:00.000Z",
    audience: "https://mempool.trustlink.dev",
    ...overrides,
  };
  return {
    authorization,
    ownerVerification: {
      signerPublicKey: new PublicKey(owner.publicKey).toBase58(),
      signatureBase64: Buffer.from(
        nacl.sign.detached(
          serializeDeviceAuthorization(authorization),
          owner.secretKey,
        ),
      ).toString("base64"),
    },
  };
}

function verifyOwnerAuthorization(fixture) {
  return verifyTransientOwnerAuthorization({
    authorization: fixture.authorization,
    ownerVerification: fixture.ownerVerification,
    expectedNetwork: "devnet",
    expectedTinCommitment: "tin-commitment",
    expectedAudience: "https://mempool.trustlink.dev",
    expectedDeviceSigningKeyFingerprint: "signing-fingerprint",
    expectedDeviceEncryptionKeyFingerprint: "encryption-fingerprint",
    now: new Date("2026-07-14T10:05:00.000Z"),
  });
}

test("owner authorization is bound to the exact device, network, TIN, audience, and scope", () => {
  const fixture = createOwnerAuthorization();
  assert.deepEqual(verifyOwnerAuthorization(fixture), { valid: true });
  assert.equal(
    verifyOwnerAuthorization({
      ...fixture,
      authorization: { ...fixture.authorization, network: "mainnet-beta" },
    }).valid,
    false,
  );
  assert.equal(
    verifyOwnerAuthorization({
      ...fixture,
      authorization: { ...fixture.authorization, tinCommitment: "other-tin" },
    }).valid,
    false,
  );
  assert.equal(
    verifyOwnerAuthorization({
      ...fixture,
      authorization: {
        ...fixture.authorization,
        deviceEncryptionKeyFingerprint: "other-device",
      },
    }).valid,
    false,
  );
  assert.equal(
    verifyOwnerAuthorization({
      ...fixture,
      authorization: {
        ...fixture.authorization,
        historyRecoveryScope: "future-only",
      },
    }).valid,
    false,
  );
});

test("copied owner signature cannot authorize modified claims", () => {
  const fixture = createOwnerAuthorization();
  const modified = {
    ...fixture,
    authorization: {
      ...fixture.authorization,
      permissions: [...fixture.authorization.permissions, "device:revoke"],
    },
  };
  assert.deepEqual(verifyOwnerAuthorization(modified), {
    valid: false,
    reason: "invalid-owner-signature",
  });
});

async function createSessionProofFixture() {
  const credential = await generateNonExportableDeviceSigningCredential();
  const bodyCommitment = await createRequestBodyCommitment(
    new TextEncoder().encode('{"receiptId":"receipt-1"}'),
  );
  const claims = {
    protocolVersion: TSN_SESSION_PROOF_VERSION,
    domain: TSN_SESSION_PROOF_DOMAIN,
    sessionId: "session-1",
    deviceId: "device-1",
    deviceSigningKeyFingerprint: credential.fingerprint,
    permission: "private-receipt:read",
    method: "POST",
    resource: "/v1/private-receipts/receipt-1/access",
    bodyCommitment,
    nonce: "request-nonce",
    issuedAt: "2026-07-14T10:00:00.000Z",
    expiresAt: "2026-07-14T10:01:00.000Z",
    audience: "https://mempool.trustlink.dev",
  };
  return {
    credential,
    claims,
    proof: await signSessionProof(claims, credential.privateKey),
  };
}

async function verifyProof(fixture, overrides = {}) {
  return verifySessionProof({
    proof: fixture.proof,
    deviceSigningPublicKey: fixture.credential.publicKey,
    expectedSessionId: "session-1",
    expectedDeviceId: "device-1",
    expectedPermission: "private-receipt:read",
    expectedMethod: "POST",
    expectedResource: "/v1/private-receipts/receipt-1/access",
    expectedBodyCommitment: fixture.claims.bodyCommitment,
    expectedAudience: "https://mempool.trustlink.dev",
    sessionExpiresAt: "2026-07-14T12:00:00.000Z",
    deviceStatus: "active",
    now: new Date("2026-07-14T10:00:30.000Z"),
    consumeNonce: () => true,
    ...overrides,
  });
}

test("sensitive receipt request requires the registered device proof", async () => {
  const fixture = await createSessionProofFixture();
  assert.deepEqual(await verifyProof(fixture), { valid: true });
  const attacker = await generateNonExportableDeviceSigningCredential();
  assert.equal(
    (await verifyProof(fixture, {
      deviceSigningPublicKey: attacker.publicKey,
    })).valid,
    false,
  );
});

test("stolen session proof cannot target another receipt or permission", async () => {
  const fixture = await createSessionProofFixture();
  assert.equal(
    (await verifyProof(fixture, {
      expectedResource: "/v1/private-receipts/receipt-2/access",
    })).valid,
    false,
  );
  assert.equal(
    (await verifyProof(fixture, {
      expectedPermission: "private-history:recover",
    })).valid,
    false,
  );
});

test("revoked device and replayed request nonce are rejected", async () => {
  const fixture = await createSessionProofFixture();
  assert.deepEqual(
    await verifyProof(fixture, { deviceStatus: "revoked" }),
    { valid: false, reason: "device-not-active" },
  );
  assert.deepEqual(
    await verifyProof(fixture, { consumeNonce: () => false }),
    { valid: false, reason: "nonce-reused" },
  );
});
