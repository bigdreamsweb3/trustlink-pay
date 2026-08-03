import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalFields,
  sha256Hex,
  toArrayBuffer,
} from "./receipts/internal/encoding.js";
import {
  fingerprintDeviceSigningPublicKey,
  fingerprintEncryptionPublicKey,
} from "./device/key-fingerprints.js";
import { serializeTinMasterSeedWalletAuthorization } from "./tin-envelopes.js";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import type { TinDeviceKeyEnvelope } from "./tin-device-key-envelope.js";

export const TIN_DEVICE_ACCESS_PROOF_VERSION = "tsn-tin-device-access-proof";
export const TIN_DEVICE_ACCESS_PROOF_DOMAIN = "TSN_TIN_DEVICE_THRESHOLD_ACCESS";

export type TinAuthorizedDeviceSigner = {
  deviceId: string;
  signingPublicKey: JsonWebKey;
  signingKeyFingerprint: string;
  encryptionPublicKey: JsonWebKey;
  encryptionKeyFingerprint: string;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  /**
   * Local-only capability backed by the authorized device's non-exportable
   * X25519 private key. This function must never be serialized or sent over
   * the network.
   */
  unwrapThresholdKey(
    envelope: TinDeviceKeyEnvelope,
    proof: TinDeviceAccessProof,
  ): Promise<Uint8Array>;
};

export type TinDeviceAccessProof = {
  version: typeof TIN_DEVICE_ACCESS_PROOF_VERSION;
  domain: typeof TIN_DEVICE_ACCESS_PROOF_DOMAIN;
  operation: "PROTECT_KEY" | "RELEASE_KEY";
  tin: string;
  ownerPublicKey: string;
  routeVersion: number;
  pruConfigurationHash: string;
  deviceSessionBinding: string;
  deviceId: string;
  deviceSigningKeyFingerprint: string;
  deviceSigningPublicKey: JsonWebKey;
  deviceEncryptionKeyFingerprint: string;
  deviceEncryptionPublicKey: JsonWebKey;
  walletAuthorizationCommitment: string;
  resourceCommitment: string;
  requestNonce: string;
  issuedAt: string;
  expiresAt: string;
  signatureBase64Url: string;
};

export function serializeTinDeviceAccessProof(
  proof: Omit<TinDeviceAccessProof, "signatureBase64Url">,
) {
  const canonicalPublicKey = JSON.stringify({
    kty: proof.deviceSigningPublicKey.kty ?? "",
    crv: proof.deviceSigningPublicKey.crv ?? "",
    x: proof.deviceSigningPublicKey.x ?? "",
  });
  const canonicalEncryptionPublicKey = JSON.stringify({
    kty: proof.deviceEncryptionPublicKey.kty ?? "",
    crv: proof.deviceEncryptionPublicKey.crv ?? "",
    x: proof.deviceEncryptionPublicKey.x ?? "",
  });
  return canonicalFields([
    proof.domain,
    proof.version,
    proof.operation,
    proof.tin,
    proof.ownerPublicKey,
    String(proof.routeVersion),
    proof.pruConfigurationHash.toLowerCase(),
    proof.deviceSessionBinding,
    proof.deviceId,
    proof.deviceSigningKeyFingerprint,
    canonicalPublicKey,
    proof.deviceEncryptionKeyFingerprint,
    canonicalEncryptionPublicKey,
    proof.walletAuthorizationCommitment,
    proof.resourceCommitment,
    proof.requestNonce,
    proof.issuedAt,
    proof.expiresAt,
  ]);
}

export async function createTinDeviceAccessProof(params: {
  operation: "PROTECT_KEY" | "RELEASE_KEY";
  tin: string;
  ownerPublicKey: string;
  routeVersion: number;
  pruConfigurationHash: string;
  deviceSessionBinding: string;
  walletAuthorizationMessage: Uint8Array;
  resourceCommitment: string;
  device: TinAuthorizedDeviceSigner;
  now?: Date;
}) {
  if (!/^[a-f0-9]{64}$/i.test(params.resourceCommitment)) {
    throw new Error("Threshold resource commitment must be a 32-byte hexadecimal commitment");
  }
  const now = params.now ?? new Date();
  const unsigned = {
    version: TIN_DEVICE_ACCESS_PROOF_VERSION,
    domain: TIN_DEVICE_ACCESS_PROOF_DOMAIN,
    operation: params.operation,
    tin: params.tin,
    ownerPublicKey: params.ownerPublicKey,
    routeVersion: params.routeVersion,
    pruConfigurationHash: params.pruConfigurationHash,
    deviceSessionBinding: params.deviceSessionBinding,
    deviceId: params.device.deviceId,
    deviceSigningKeyFingerprint: params.device.signingKeyFingerprint,
    deviceSigningPublicKey: params.device.signingPublicKey,
    deviceEncryptionKeyFingerprint: params.device.encryptionKeyFingerprint,
    deviceEncryptionPublicKey: params.device.encryptionPublicKey,
    walletAuthorizationCommitment: await sha256Hex(params.walletAuthorizationMessage),
    resourceCommitment: params.resourceCommitment,
    requestNonce: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32))),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
  } as const;
  const message = serializeTinDeviceAccessProof(unsigned);
  const signature = await params.device.signMessage(message);
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    params.device.signingPublicKey,
    "Ed25519",
    false,
    ["verify"],
  );
  if (!await crypto.subtle.verify(
    "Ed25519",
    publicKey,
    toArrayBuffer(signature),
    toArrayBuffer(message),
  )) {
    throw new Error("Authorized-device proof-of-possession is invalid");
  }
  return {
    ...unsigned,
    signatureBase64Url: bytesToBase64Url(signature),
  } satisfies TinDeviceAccessProof;
}

export type TinDeviceAccessNonceConsumer = (
  nonce: string,
  expiresAt: string,
) => boolean | Promise<boolean>;

export async function verifyTinDeviceAccessRequest(params: {
  expectedOperation: "PROTECT_KEY" | "RELEASE_KEY";
  expectedTin: string;
  expectedOwnerPublicKey: string;
  expectedRouteVersion: number;
  expectedPruConfigurationHash: string;
  expectedDeviceSessionBinding: string;
  expectedResourceCommitment: string;
  walletAuthorizationMessage: Uint8Array;
  walletAuthorizationSignature: Uint8Array;
  deviceAccessProof: TinDeviceAccessProof;
  consumeNonce?: TinDeviceAccessNonceConsumer;
  now?: Date;
}) {
  const proof = params.deviceAccessProof;
  if (
    !/^[a-f0-9]{64}$/i.test(params.expectedResourceCommitment) ||
    !/^[a-f0-9]{64}$/i.test(proof.resourceCommitment)
  ) {
    throw new Error("Threshold resource commitment is invalid");
  }
  if (
    proof.version !== TIN_DEVICE_ACCESS_PROOF_VERSION ||
    proof.domain !== TIN_DEVICE_ACCESS_PROOF_DOMAIN
  ) {
    throw new Error("Authorized-device proof version or domain is invalid");
  }
  if (
    proof.operation !== params.expectedOperation ||
    proof.tin !== params.expectedTin ||
    proof.ownerPublicKey !== params.expectedOwnerPublicKey ||
    proof.routeVersion !== params.expectedRouteVersion ||
    proof.pruConfigurationHash.toLowerCase() !==
      params.expectedPruConfigurationHash.toLowerCase() ||
    proof.deviceSessionBinding !== params.expectedDeviceSessionBinding ||
    proof.resourceCommitment.toLowerCase() !== params.expectedResourceCommitment.toLowerCase()
  ) {
    throw new Error("Authorized-device proof does not match the threshold request");
  }

  const expectedWalletMessage = serializeTinMasterSeedWalletAuthorization({
    tin: params.expectedTin,
    ownerPublicKey: params.expectedOwnerPublicKey,
    routeVersion: params.expectedRouteVersion,
    pruConfigurationHash: params.expectedPruConfigurationHash,
    resourceCommitment: params.expectedResourceCommitment,
    deviceSessionBinding: params.expectedDeviceSessionBinding,
  });
  if (
    expectedWalletMessage.length !== params.walletAuthorizationMessage.length ||
    !nacl.verify(expectedWalletMessage, params.walletAuthorizationMessage)
  ) {
    throw new Error("Main-wallet authorization message does not match the threshold request");
  }
  const walletCommitment = await sha256Hex(params.walletAuthorizationMessage);
  if (walletCommitment !== proof.walletAuthorizationCommitment) {
    throw new Error("Authorized-device proof is not bound to the main-wallet authorization");
  }
  const owner = new PublicKey(params.expectedOwnerPublicKey);
  if (
    params.walletAuthorizationSignature.length !== nacl.sign.signatureLength ||
    !nacl.sign.detached.verify(
      params.walletAuthorizationMessage,
      params.walletAuthorizationSignature,
      owner.toBytes(),
    )
  ) {
    throw new Error("Main-wallet authorization signature is invalid");
  }

  const fingerprint = await fingerprintDeviceSigningPublicKey(proof.deviceSigningPublicKey);
  if (fingerprint !== proof.deviceSigningKeyFingerprint) {
    throw new Error("Authorized-device signing-key fingerprint is invalid");
  }
  const encryptionFingerprint = await fingerprintEncryptionPublicKey(
    proof.deviceEncryptionPublicKey,
    "device",
  );
  if (encryptionFingerprint !== proof.deviceEncryptionKeyFingerprint) {
    throw new Error("Authorized-device encryption-key fingerprint is invalid");
  }
  if (!params.expectedDeviceSessionBinding.endsWith(
    `:device:${fingerprint}:encryption:${encryptionFingerprint}`,
  )) {
    throw new Error("Threshold session is not bound to the authorized device");
  }

  const issuedAt = Date.parse(proof.issuedAt);
  const expiresAt = Date.parse(proof.expiresAt);
  const now = (params.now ?? new Date()).getTime();
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > 5 * 60 * 1000 ||
    issuedAt > now + 30_000 ||
    expiresAt <= now
  ) {
    throw new Error("Authorized-device proof is expired or has an invalid validity window");
  }

  const unsigned = { ...proof };
  delete (unsigned as Partial<TinDeviceAccessProof>).signatureBase64Url;
  const message = serializeTinDeviceAccessProof(
    unsigned as Omit<TinDeviceAccessProof, "signatureBase64Url">,
  );
  let publicKey: CryptoKey;
  try {
    publicKey = await crypto.subtle.importKey(
      "jwk",
      proof.deviceSigningPublicKey,
      "Ed25519",
      false,
      ["verify"],
    );
  } catch {
    throw new Error("Authorized-device signing public key is invalid");
  }
  const signature = base64UrlToBytes(proof.signatureBase64Url);
  if (!await crypto.subtle.verify(
    "Ed25519",
    publicKey,
    toArrayBuffer(signature),
    toArrayBuffer(message),
  )) {
    throw new Error("Authorized-device signature is invalid");
  }
  if (params.consumeNonce && !await params.consumeNonce(proof.requestNonce, proof.expiresAt)) {
    throw new Error("Authorized-device proof nonce was already used");
  }
  return {
    walletPublicKey: params.expectedOwnerPublicKey,
    deviceId: proof.deviceId,
    deviceSigningKeyFingerprint: fingerprint,
    deviceEncryptionKeyFingerprint: encryptionFingerprint,
    requestNonce: proof.requestNonce,
    expiresAt: proof.expiresAt,
  };
}
