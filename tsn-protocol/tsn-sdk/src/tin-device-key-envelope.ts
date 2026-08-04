import type { TinDeviceAccessProof } from "./tin-device-access.js";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalFields,
  sha256Hex,
  toArrayBuffer,
} from "./receipts/internal/encoding.js";

export const TIN_DEVICE_KEY_ENVELOPE_VERSION = "tsn-tin-device-key-envelope";
export const TIN_DEVICE_KEY_ENVELOPE_ALGORITHM =
  "x25519-hkdf-sha256-aes-256-gcm" as const;

export type TinDeviceKeyEnvelope = {
  version: typeof TIN_DEVICE_KEY_ENVELOPE_VERSION;
  algorithm: typeof TIN_DEVICE_KEY_ENVELOPE_ALGORITHM;
  recipientKeyFingerprint: string;
  ephemeralPublicKey: JsonWebKey;
  nonceBase64Url: string;
  wrappedKeyBase64Url: string;
  aadCommitment: string;
  /** Stable device binding for long-lived TIN envelopes; omitted by legacy request envelopes. */
  aadMode?: "request" | "device-envelope";
};

function accessAad(
  proof: TinDeviceAccessProof,
  mode: "request" | "device-envelope" = "request",
) {
  // Request proofs contain intentionally short-lived fields (session binding,
  // wallet signature commitment, nonce and expiry).  They authenticate an
  // access request, but must not be baked into the long-lived device envelope:
  // a fresh wallet authorization is required on every unlock.  The envelope
  // therefore authenticates stable identity and device-key fields only.
  return mode === "device-envelope"
    ? canonicalFields([
        "TSN_TIN_DEVICE_KEY_DEVICE_ENVELOPE",
        proof.tin,
        proof.ownerPublicKey,
        String(proof.routeVersion),
        proof.pruConfigurationHash.toLowerCase(),
        proof.resourceCommitment.toLowerCase(),
        proof.deviceId,
        proof.deviceSigningKeyFingerprint,
        proof.deviceEncryptionKeyFingerprint,
      ])
    : canonicalFields([
        "TSN_TIN_DEVICE_KEY_RELEASE",
        proof.operation,
        proof.tin,
        proof.ownerPublicKey,
        String(proof.routeVersion),
        proof.pruConfigurationHash.toLowerCase(),
        proof.resourceCommitment.toLowerCase(),
        proof.deviceSessionBinding,
        proof.deviceId,
        proof.deviceSigningKeyFingerprint,
        proof.deviceEncryptionKeyFingerprint,
        proof.walletAuthorizationCommitment,
        proof.requestNonce,
        proof.expiresAt,
      ]);
}

async function deriveWrappingKey(params: {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  nonce: Uint8Array;
  recipientKeyFingerprint: string;
}) {
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "X25519", public: params.publicKey },
    params.privateKey,
    256,
  ));
  try {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(sharedSecret),
      "HKDF",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: toArrayBuffer(params.nonce),
        info: toArrayBuffer(canonicalFields([
          "TSN_TIN_DEVICE_KEY_WRAP",
          params.recipientKeyFingerprint,
        ])),
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    sharedSecret.fill(0);
  }
}

/**
 * Re-encrypts threshold-released key material to the authorized device. The
 * protected TIN master seed is never an input to this function.
 */
export async function wrapTinThresholdKeyForDevice(params: {
  keyMaterial: Uint8Array;
  proof: TinDeviceAccessProof;
  aadMode?: "request" | "device-envelope";
}): Promise<TinDeviceKeyEnvelope> {
  if (params.keyMaterial.length !== 32) {
    throw new Error("TIN threshold key material must be exactly 32 bytes");
  }
  const recipientPublicKey = await crypto.subtle.importKey(
    "jwk",
    params.proof.deviceEncryptionPublicKey,
    { name: "X25519" },
    false,
    [],
  );
  const ephemeral = await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"],
  ) as CryptoKeyPair;
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = accessAad(params.proof, params.aadMode);
  const wrappingKey = await deriveWrappingKey({
    privateKey: ephemeral.privateKey,
    publicKey: recipientPublicKey,
    nonce,
    recipientKeyFingerprint: params.proof.deviceEncryptionKeyFingerprint,
  });
  const wrapped = new Uint8Array(await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aad),
      tagLength: 128,
    },
    wrappingKey,
    toArrayBuffer(params.keyMaterial),
  ));
  return {
    version: TIN_DEVICE_KEY_ENVELOPE_VERSION,
    algorithm: TIN_DEVICE_KEY_ENVELOPE_ALGORITHM,
    recipientKeyFingerprint: params.proof.deviceEncryptionKeyFingerprint,
    ephemeralPublicKey: await crypto.subtle.exportKey("jwk", ephemeral.publicKey),
    nonceBase64Url: bytesToBase64Url(nonce),
    wrappedKeyBase64Url: bytesToBase64Url(wrapped),
    aadCommitment: await sha256Hex(aad),
    aadMode: params.aadMode ?? "request",
  };
}

export async function unwrapTinThresholdKeyOnDevice(params: {
  envelope: TinDeviceKeyEnvelope;
  proof: TinDeviceAccessProof;
  deviceEncryptionPrivateKey: CryptoKey;
  aadMode?: "request" | "device-envelope";
}) {
  if (
    params.envelope.version !== TIN_DEVICE_KEY_ENVELOPE_VERSION ||
    params.envelope.algorithm !== TIN_DEVICE_KEY_ENVELOPE_ALGORITHM ||
    params.envelope.recipientKeyFingerprint !==
      params.proof.deviceEncryptionKeyFingerprint
  ) {
    throw new Error("TIN device key envelope does not match the authorized device");
  }
  const aad = accessAad(params.proof, params.aadMode ?? params.envelope.aadMode);
  if (await sha256Hex(aad) !== params.envelope.aadCommitment) {
    throw new Error("TIN device key envelope context has been modified");
  }
  const ephemeralPublicKey = await crypto.subtle.importKey(
    "jwk",
    params.envelope.ephemeralPublicKey,
    { name: "X25519" },
    false,
    [],
  );
  const nonce = base64UrlToBytes(params.envelope.nonceBase64Url);
  const wrappingKey = await deriveWrappingKey({
    privateKey: params.deviceEncryptionPrivateKey,
    publicKey: ephemeralPublicKey,
    nonce,
    recipientKeyFingerprint: params.envelope.recipientKeyFingerprint,
  });
  const unwrapped = new Uint8Array(await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aad),
      tagLength: 128,
    },
    wrappingKey,
    toArrayBuffer(base64UrlToBytes(params.envelope.wrappedKeyBase64Url)),
  ));
  if (unwrapped.length !== 32) {
    unwrapped.fill(0);
    throw new Error("TIN threshold key response has an invalid length");
  }
  return unwrapped;
}
