import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";

import {
  TSN_DEVICE_AUTHORIZATION_DOMAIN,
  TSN_DEVICE_AUTHORIZATION_VERSION,
  TSN_SESSION_PROOF_DOMAIN,
  TSN_SESSION_PROOF_VERSION,
  authorizeDevice,
  createOwnerIdentityCommitment,
  createRequestBodyCommitment,
  createTinCommitment,
  generateNonExportableDeviceCredentials,
  serializeDeviceAuthorization,
  signSessionProof,
} from "../dist/index.js";
import {
  createDeviceRegistrationChallenge,
  createSolanaTinsOwnerVerifier,
  verifyTsnDeviceRegistration,
} from "../dist/authorization/server/index.js";
import {
  verifyTsnAuthorizedPrivateRequest,
} from "../dist/sessions/server/index.js";

async function createRegistrationFixture() {
  const credentials = await generateNonExportableDeviceCredentials();
  const owner = nacl.sign.keyPair();
  const ownerPublicKey = new PublicKey(owner.publicKey).toBase58();
  const tin = "1000000042";
  const now = Date.now();
  const claims = {
    protocolVersion: TSN_DEVICE_AUTHORIZATION_VERSION,
    domain: TSN_DEVICE_AUTHORIZATION_DOMAIN,
    network: "devnet",
    tinCommitment: await createTinCommitment(tin),
    ownerIdentityCommitment: await createOwnerIdentityCommitment(ownerPublicKey),
    deviceSigningKeyFingerprint: credentials.signing.fingerprint,
    deviceEncryptionKeyFingerprint: credentials.encryption.keyId,
    permissions: ["private-session:create", "private-receipt:read"],
    historyRecoveryScope: "all",
    nonce: "issued-registration-nonce-with-at-least-32-bytes",
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 5 * 60_000).toISOString(),
    audience: "https://authorization.tsn.example",
  };
  return {
    tin,
    credentials,
    authorization: claims,
    ownerVerification: {
      signerPublicKey: ownerPublicKey,
      signatureBase64: Buffer.from(
        nacl.sign.detached(serializeDeviceAuthorization(claims), owner.secretKey),
      ).toString("base64"),
    },
  };
}

test("registration verifier stores only public device material after TINS owner verification", async () => {
  const fixture = await createRegistrationFixture();
  const used = new Set();
  const verified = await verifyTsnDeviceRegistration({
    tin: fixture.tin,
    deviceId: "b38a2475-77ce-4ad7-8679-4b862e3568a4",
    signingPublicKey: fixture.credentials.signing.publicKey,
    encryptionPublicKey: fixture.credentials.encryption.publicKey,
    authorization: fixture.authorization,
    ownerVerification: fixture.ownerVerification,
    expectedNetwork: "devnet",
    expectedAudience: "https://authorization.tsn.example",
    tinsOwnerVerifier: {
      async verifyOwner({ tin, transientSignerPublicKey }) {
        assert.equal(tin, fixture.tin);
        assert.equal(
          transientSignerPublicKey,
          fixture.ownerVerification.signerPublicKey,
        );
        return {
          tin,
          ownerIdentityCommitment: fixture.authorization.ownerIdentityCommitment,
          tinsAccount: "tins-account",
        };
      },
    },
    consumeNonce: async ({ nonce }) => {
      if (used.has(nonce)) return false;
      used.add(nonce);
      return true;
    },
  });

  assert.deepEqual(verified.signingPublicKey, fixture.credentials.signing.publicKey);
  assert.deepEqual(verified.encryptionPublicKey, fixture.credentials.encryption.publicKey);
  assert.equal("privateKey" in verified, false);
  assert.equal("decryptedReceipt" in verified, false);
  assert.equal("ownerPublicKey" in verified, false);
  assert.equal("signerPublicKey" in verified, false);
  assert.equal("transientSignerPublicKey" in verified, false);
});

test("registration authorization cannot be replayed after atomic nonce consumption", async () => {
  const fixture = await createRegistrationFixture();
  let consumed = false;
  const params = {
    tin: fixture.tin,
    deviceId: "f50ddb44-9b77-41bc-a78c-917d7bfbd9b3",
    signingPublicKey: fixture.credentials.signing.publicKey,
    encryptionPublicKey: fixture.credentials.encryption.publicKey,
    authorization: fixture.authorization,
    ownerVerification: fixture.ownerVerification,
    expectedNetwork: "devnet",
    expectedAudience: "https://authorization.tsn.example",
    tinsOwnerVerifier: {
      async verifyOwner() {
        return {
          tin: fixture.tin,
          ownerIdentityCommitment: fixture.authorization.ownerIdentityCommitment,
          tinsAccount: "tins-account",
        };
      },
    },
    consumeNonce: async () => consumed ? false : (consumed = true),
  };
  await verifyTsnDeviceRegistration(params);
  await assert.rejects(
    verifyTsnDeviceRegistration(params),
    /challenge is invalid, expired, or already consumed/,
  );
});

test("registration challenges are short-lived and contain no key material", () => {
  const challenge = createDeviceRegistrationChallenge({
    tinCommitment: "tin-commitment",
    network: "devnet",
    audience: "https://authorization.tsn.example",
    now: new Date("2026-07-14T10:00:00.000Z"),
  });
  assert.equal(challenge.expiresAt, "2026-07-14T10:05:00.000Z");
  assert.equal("privateKey" in challenge, false);
  assert.equal("signerPublicKey" in challenge, false);
});

test("a session token without a fresh registered-device signature cannot retrieve ciphertext", async () => {
  const credentials = await generateNonExportableDeviceCredentials();
  const attacker = await generateNonExportableDeviceCredentials();
  const now = Date.now();
  const bodyCommitment = await createRequestBodyCommitment(
    new TextEncoder().encode("receipt-1"),
  );
  const claims = {
    protocolVersion: TSN_SESSION_PROOF_VERSION,
    domain: TSN_SESSION_PROOF_DOMAIN,
    sessionId: "session-1",
    deviceId: "device-1",
    deviceSigningKeyFingerprint: attacker.signing.fingerprint,
    permission: "private-receipt:read",
    method: "POST",
    resource: "/v1/private-receipts/receipt-1/access",
    bodyCommitment,
    nonce: "fresh-request-nonce-with-at-least-32-bytes",
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    audience: "https://authorization.tsn.example",
  };
  const proof = await signSessionProof(claims, attacker.signing.privateKey);
  await assert.rejects(
    verifyTsnAuthorizedPrivateRequest({
      sessionToken: "stolen-session-token",
      proof,
      permission: "private-receipt:read",
      method: "POST",
      resource: claims.resource,
      bodyCommitment,
      expectedAudience: claims.audience,
      findSessionByToken: async () => ({
        sessionId: claims.sessionId,
        tinCommitment: "tin-commitment",
        deviceId: claims.deviceId,
        permissions: ["private-receipt:read"],
        audience: claims.audience,
        expiresAt: new Date(now + 10 * 60_000).toISOString(),
        status: "active",
      }),
      findDevice: async () => ({
        deviceId: claims.deviceId,
        tinCommitment: "tin-commitment",
        signingKeyFingerprint: credentials.signing.fingerprint,
        signingPublicKey: credentials.signing.publicKey,
        encryptionKeyFingerprint: credentials.encryption.keyId,
        permissions: ["private-receipt:read"],
        status: "active",
      }),
      consumeNonce: async () => true,
    }),
    /unregistered signing key/,
  );
});

test("Solana TINS verifier reads the owner commitment from the derived registry account", async () => {
  const owner = nacl.sign.keyPair();
  const ownerPublicKey = new PublicKey(owner.publicKey);
  const tin = "1000000042";
  const ownerCommitment = createHash("sha256")
    .update(ownerPublicKey.toBytes())
    .digest();
  const data = Buffer.alloc(8 + 4 + 32 + 4 + 8 + 64);
  let offset = 0;
  data.writeBigUInt64LE(BigInt(tin), offset);
  offset += 8;
  data.writeUInt32LE(0, offset);
  offset += 4;
  ownerCommitment.copy(data, offset);
  offset += 32;
  data.writeUInt32LE(0, offset);
  offset += 4;
  data.writeBigInt64LE(1n, offset);

  let fallbackScanned = false;
  const verifier = createSolanaTinsOwnerVerifier({
    connection: {
      async getAccountInfo() {
        return { data };
      },
      async getProgramAccounts() {
        fallbackScanned = true;
        return [];
      },
    },
    programId: new PublicKey(nacl.sign.keyPair().publicKey),
  });
  const result = await verifier.verifyOwner({
    tin,
    transientSignerPublicKey: ownerPublicKey.toBase58(),
  });
  assert.equal(result.ownerIdentityCommitment, ownerCommitment.toString("hex"));
  assert.equal("ownerPublicKey" in result, false);
  assert.equal("signerPublicKey" in result, false);
  assert.equal("transientSignerPublicKey" in result, false);
  assert.equal(fallbackScanned, false);
});

test("public authorizeDevice returns only privacy-safe state", async () => {
  const credentials = await generateNonExportableDeviceCredentials();
  const owner = nacl.sign.keyPair();
  const tin = "1000000042";
  const tinCommitment = await createTinCommitment(tin);
  let registrationBody;
  const result = await authorizeDevice({
    authorizationServiceUrl: "https://authorization.tsn.example",
    tin,
    deviceId: "a17821e5-2b4f-479c-a55c-b0fcbd9c26e4",
    signingPublicKey: credentials.signing.publicKey,
    encryptionPublicKey: credentials.encryption.publicKey,
    permissions: ["private-session:create", "private-receipt:read"],
    historyRecoveryScope: "all",
    wallet: {
      publicKey: new PublicKey(owner.publicKey).toBase58(),
      async signMessage(message) {
        return nacl.sign.detached(message, owner.secretKey);
      },
    },
    async fetch(url, init) {
      if (String(url).endsWith("/devices/challenge")) {
        return new Response(JSON.stringify({
          protocolVersion: "tsn-device-registration-challenge-v1",
          nonce: "registration-nonce-with-at-least-thirty-two-bytes",
          tinCommitment,
          network: "devnet",
          audience: "https://authorization.tsn.example",
          issuedAt: new Date(Date.now() - 1_000).toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }), { status: 201 });
      }
      registrationBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify({
        ownerVerified: true,
        deviceAuthorized: true,
      }), { status: 201 });
    },
  });
  assert.deepEqual(result, {
    ownerVerified: true,
    deviceAuthorized: true,
  });
  assert.equal("signerPublicKey" in registrationBody.authorization, false);
  assert.equal(typeof registrationBody.ownerVerification.signerPublicKey, "string");
  assert.equal("ownerPublicKey" in result, false);
  assert.equal("signerPublicKey" in result, false);
});
