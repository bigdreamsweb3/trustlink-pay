import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";

import {
  TSN_DEVICE_AUTHORIZATION_DOMAIN,
  TSN_DEVICE_AUTHORIZATION_VERSION,
  canonicalizeDeviceAuthorizationClaims,
  serializeDeviceAuthorization,
  type DeviceAuthorizationClaims,
} from "../device-authorization.js";

export interface TransientOwnerAuthorizationProof {
  signerPublicKey: string;
  signatureBase64: string;
}

export function verifyTransientOwnerAuthorization(params: {
  authorization: DeviceAuthorizationClaims;
  ownerVerification: TransientOwnerAuthorizationProof;
  expectedNetwork: string;
  expectedTinCommitment: string;
  expectedAudience: string;
  expectedDeviceSigningKeyFingerprint: string;
  expectedDeviceEncryptionKeyFingerprint: string;
  now?: Date;
}): { valid: true } | { valid: false; reason: string } {
  const claims = canonicalizeDeviceAuthorizationClaims(params.authorization);
  if (
    claims.protocolVersion !== TSN_DEVICE_AUTHORIZATION_VERSION ||
    claims.domain !== TSN_DEVICE_AUTHORIZATION_DOMAIN
  ) {
    return { valid: false, reason: "unsupported-authorization-domain" };
  }
  if (claims.network !== params.expectedNetwork) {
    return { valid: false, reason: "network-mismatch" };
  }
  if (claims.tinCommitment !== params.expectedTinCommitment) {
    return { valid: false, reason: "tin-mismatch" };
  }
  if (claims.audience !== params.expectedAudience) {
    return { valid: false, reason: "audience-mismatch" };
  }
  if (
    claims.deviceSigningKeyFingerprint !==
    params.expectedDeviceSigningKeyFingerprint
  ) {
    return { valid: false, reason: "device-signing-key-mismatch" };
  }
  if (
    claims.deviceEncryptionKeyFingerprint !==
    params.expectedDeviceEncryptionKeyFingerprint
  ) {
    return { valid: false, reason: "device-encryption-key-mismatch" };
  }

  const now = (params.now ?? new Date()).getTime();
  const issuedAt = Date.parse(claims.issuedAt);
  const expiresAt = Date.parse(claims.expiresAt);
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    issuedAt > now ||
    expiresAt <= now ||
    expiresAt <= issuedAt
  ) {
    return { valid: false, reason: "authorization-expired-or-invalid" };
  }

  const signerPublicKey = new PublicKey(
    params.ownerVerification.signerPublicKey,
  ).toBytes();
  const signature = Buffer.from(
    params.ownerVerification.signatureBase64,
    "base64",
  );
  if (
    !nacl.sign.detached.verify(
      serializeDeviceAuthorization(claims),
      signature,
      signerPublicKey,
    )
  ) {
    return { valid: false, reason: "invalid-owner-signature" };
  }
  return { valid: true };
}
