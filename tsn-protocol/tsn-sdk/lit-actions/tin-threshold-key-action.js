/*
 * Immutable Lit Action for TIN master-seed data-key protection.
 * Inputs are public proofs and opaque PKP ciphertext only. The TIN master seed
 * and plaintext seed envelope are deliberately outside this action boundary.
 */
const RECEIPT_DOMAIN = "TSN_TIN_THRESHOLD_NONCE_RECEIPT";
const ACTION_DOMAIN = "TSN_TIN_THRESHOLD_KEY_ACTION";

const text = new TextEncoder();
const b64url = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64url = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};
const canonical = (fields) => text.encode(
  fields.map((field) => `${String(field).length}:${String(field)}`).join("|"),
);
const sha256 = async (bytes) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
const sha256hex = async (bytes) => Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  (byte) => byte.toString(16).padStart(2, "0"),
).join("");

async function verifyReceipt(receipt, request, expectedVerifier) {
  const proof = request.deviceAccessProof;
  if (
    receipt?.domain !== RECEIPT_DOMAIN ||
    receipt.operation !== request.operation ||
    receipt.tin !== request.access.tin ||
    receipt.ownerPublicKey !== request.access.ownerPublicKey ||
    receipt.resourceCommitment !== request.access.resourceCommitment.toLowerCase() ||
    receipt.requestNonce !== proof.requestNonce ||
    receipt.expiresAt !== proof.expiresAt ||
    receipt.verifierPublicKeyBase64Url !== expectedVerifier
  ) throw new Error("TSN Node nonce receipt does not match the threshold request");
  const now = Date.now();
  if (Date.parse(receipt.consumedAt) >= Date.parse(receipt.expiresAt) || Date.parse(receipt.expiresAt) <= now) {
    throw new Error("TSN Node nonce receipt is expired");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    unb64url(expectedVerifier),
    "Ed25519",
    false,
    ["verify"],
  );
  const message = canonical([
    receipt.domain,
    receipt.operation,
    receipt.tin,
    receipt.ownerPublicKey,
    receipt.resourceCommitment,
    receipt.requestNonce,
    receipt.consumedAt,
    receipt.expiresAt,
    receipt.verifierPublicKeyBase64Url,
  ]);
  if (!await crypto.subtle.verify("Ed25519", key, unb64url(receipt.signatureBase64Url), message)) {
    throw new Error("TSN Node nonce receipt signature is invalid");
  }
}

function deviceAad(proof) {
  return canonical([
    "TSN_TIN_DEVICE_KEY_RELEASE",
    proof.operation,
    proof.tin,
    proof.ownerPublicKey,
    proof.routeVersion,
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

async function wrapForDevice(keyMaterial, proof) {
  const recipient = await crypto.subtle.importKey(
    "jwk",
    proof.deviceEncryptionPublicKey,
    { name: "X25519" },
    false,
    [],
  );
  const ephemeral = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "X25519", public: recipient },
    ephemeral.privateKey,
    256,
  ));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = deviceAad(proof);
  try {
    const material = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
    const wrappingKey = await crypto.subtle.deriveKey({
      name: "HKDF",
      hash: "SHA-256",
      salt: nonce,
      info: canonical(["TSN_TIN_DEVICE_KEY_WRAP", proof.deviceEncryptionKeyFingerprint]),
    }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const wrapped = new Uint8Array(await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv: nonce,
      additionalData: aad,
      tagLength: 128,
    }, wrappingKey, keyMaterial));
    return {
      version: "tsn-tin-device-key-envelope",
      algorithm: "x25519-hkdf-sha256-aes-256-gcm",
      recipientKeyFingerprint: proof.deviceEncryptionKeyFingerprint,
      ephemeralPublicKey: await crypto.subtle.exportKey("jwk", ephemeral.publicKey),
      nonceBase64Url: b64url(nonce),
      wrappedKeyBase64Url: b64url(wrapped),
      aadCommitment: await sha256hex(aad),
    };
  } finally {
    shared.fill(0);
  }
}

async function main({ request, replayEndpoint, verifierPublicKeyBase64Url }) {
  if (request?.domain !== ACTION_DOMAIN || !["PROTECT_KEY", "RELEASE_KEY"].includes(request.operation)) {
    throw new Error("TIN threshold action request is invalid");
  }
  const replayResponse = await fetch(replayEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!replayResponse.ok) throw new Error(`TSN Node rejected threshold access (${replayResponse.status})`);
  const nonceReceipt = await replayResponse.json();
  await verifyReceipt(nonceReceipt, request, verifierPublicKeyBase64Url);

  let keyMaterial;
  try {
    if (request.operation === "PROTECT_KEY") {
      keyMaterial = crypto.getRandomValues(new Uint8Array(32));
      const protectedKey = await Lit.Actions.Encrypt({
        pkpId: request.pkpId,
        message: b64url(keyMaterial),
      });
      const deviceKeyEnvelope = await wrapForDevice(keyMaterial, request.deviceAccessProof);
      const accessControlHash = await sha256hex(canonical([
        ACTION_DOMAIN,
        request.access.ownerPublicKey,
        request.access.resourceCommitment.toLowerCase(),
        request.pkpId,
      ]));
      const response = {
        operation: request.operation,
        protectedKey,
        protectedKeyCommitment: await sha256hex(text.encode(protectedKey)),
        accessControlHash,
        deviceKeyEnvelope,
        nonceReceipt,
      };
      Lit.Actions.setResponse({ response: JSON.stringify(response) });
      return response;
    }

    if (await sha256hex(text.encode(request.protectedKey)) !== request.protectedKeyCommitment.toLowerCase()) {
      throw new Error("Protected TIN data-key commitment is invalid");
    }
    const expectedAccessControlHash = await sha256hex(canonical([
      ACTION_DOMAIN,
      request.access.ownerPublicKey,
      request.access.resourceCommitment.toLowerCase(),
      request.pkpId,
    ]));
    if (expectedAccessControlHash !== request.accessControlHash.toLowerCase()) {
      throw new Error("Protected TIN data-key access policy is invalid");
    }
    const plaintext = await Lit.Actions.Decrypt({
      pkpId: request.pkpId,
      ciphertext: request.protectedKey,
    });
    keyMaterial = unb64url(plaintext);
    if (keyMaterial.length !== 32) throw new Error("Protected TIN data key has invalid length");
    const response = {
      operation: request.operation,
      deviceKeyEnvelope: await wrapForDevice(keyMaterial, request.deviceAccessProof),
      nonceReceipt,
    };
    Lit.Actions.setResponse({ response: JSON.stringify(response) });
    return response;
  } finally {
    if (keyMaterial) keyMaterial.fill(0);
  }
}

main({ request, replayEndpoint, verifierPublicKeyBase64Url }).catch((error) => {
  Lit.Actions.setResponse({ response: JSON.stringify({
    error: error instanceof Error ? error.message : "TIN threshold action failed",
  }) });
});
