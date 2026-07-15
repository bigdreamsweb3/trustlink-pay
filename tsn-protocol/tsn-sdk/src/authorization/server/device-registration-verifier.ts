import {
  createAuthorizationCommitment,
  createTinCommitment,
} from "../identity-commitments.js";
import {
  serializeDeviceAuthorization,
  type DeviceAuthorizationClaims,
} from "../device-authorization.js";
import { validateTsnDevicePermissions } from "../device-permissions.js";
import {
  fingerprintDeviceSigningPublicKey,
  fingerprintEncryptionPublicKey,
} from "../../device/key-fingerprints.js";
import type { TinsOwnerVerifier } from "./tins-owner-verifier.js";
import {
  verifyTransientOwnerAuthorization,
  type TransientOwnerAuthorizationProof,
} from "./transient-owner-authorization.js";

export interface VerifiedDeviceRegistration {
  deviceId: string;
  tinCommitment: string;
  ownerIdentityCommitment: string;
  signingKeyFingerprint: string;
  signingPublicKey: JsonWebKey;
  encryptionKeyFingerprint: string;
  encryptionPublicKey: JsonWebKey;
  permissions: string[];
  historyRecoveryScope: "all" | "recent" | "selected" | "future-only";
  network: string;
  audience: string;
  authorizationCommitment: string;
  authorizedAt: string;
  authorizationExpiresAt: string;
}

export async function verifyTsnDeviceRegistration(params: {
  tin: string;
  deviceId: string;
  signingPublicKey: JsonWebKey;
  encryptionPublicKey: JsonWebKey;
  authorization: DeviceAuthorizationClaims;
  ownerVerification: TransientOwnerAuthorizationProof;
  expectedNetwork: string;
  expectedAudience: string;
  tinsOwnerVerifier: TinsOwnerVerifier;
  consumeNonce: (params: {
    nonce: string;
    tinCommitment: string;
    network: string;
    audience: string;
    issuedAt: string;
    expiresAt: string;
  }) => Promise<boolean>;
}): Promise<VerifiedDeviceRegistration> {
  const tinCommitment = await createTinCommitment(params.tin);
  const signingKeyFingerprint = await fingerprintDeviceSigningPublicKey(
    params.signingPublicKey,
  );
  const encryptionKeyFingerprint = await fingerprintEncryptionPublicKey(
    params.encryptionPublicKey,
    "device",
  );
  const permissions = validateTsnDevicePermissions(
    params.authorization.permissions,
  );
  const verification = verifyTransientOwnerAuthorization({
    authorization: params.authorization,
    ownerVerification: params.ownerVerification,
    expectedNetwork: params.expectedNetwork,
    expectedTinCommitment: tinCommitment,
    expectedAudience: params.expectedAudience,
    expectedDeviceSigningKeyFingerprint: signingKeyFingerprint,
    expectedDeviceEncryptionKeyFingerprint: encryptionKeyFingerprint,
  });
  if (!verification.valid) {
    throw new Error(`Device authorization rejected: ${verification.reason}`);
  }

  const owner = await params.tinsOwnerVerifier.verifyOwner({
    tin: params.tin,
    transientSignerPublicKey: params.ownerVerification.signerPublicKey,
  });
  if (
    owner.ownerIdentityCommitment !==
    params.authorization.ownerIdentityCommitment
  ) {
    throw new Error(
      "Device authorization owner commitment does not match the on-chain TINS owner",
    );
  }
  if (
    !await params.consumeNonce({
      nonce: params.authorization.nonce,
      tinCommitment,
      network: params.authorization.network,
      audience: params.authorization.audience,
      issuedAt: params.authorization.issuedAt,
      expiresAt: params.authorization.expiresAt,
    })
  ) {
    throw new Error(
      "Device authorization challenge is invalid, expired, or already consumed",
    );
  }
  return {
    deviceId: params.deviceId,
    tinCommitment,
    ownerIdentityCommitment: owner.ownerIdentityCommitment,
    signingKeyFingerprint,
    signingPublicKey: params.signingPublicKey,
    encryptionKeyFingerprint,
    encryptionPublicKey: params.encryptionPublicKey,
    permissions,
    historyRecoveryScope: params.authorization.historyRecoveryScope,
    network: params.authorization.network,
    audience: params.authorization.audience,
    authorizationCommitment: await createAuthorizationCommitment(
      serializeDeviceAuthorization(params.authorization),
    ),
    authorizedAt: params.authorization.issuedAt,
    authorizationExpiresAt: params.authorization.expiresAt,
  };
}
