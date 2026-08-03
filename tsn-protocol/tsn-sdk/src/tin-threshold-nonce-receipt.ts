import type { TinDeviceAccessProof } from "./tin-device-access.js";
import {
  base64UrlToBytes,
  canonicalFields,
  toArrayBuffer,
} from "./receipts/internal/encoding.js";

export const TIN_THRESHOLD_NONCE_RECEIPT_DOMAIN =
  "TSN_TIN_THRESHOLD_NONCE_RECEIPT" as const;

export type TinThresholdNonceReceipt = {
  domain: typeof TIN_THRESHOLD_NONCE_RECEIPT_DOMAIN;
  operation: "PROTECT_KEY" | "RELEASE_KEY";
  tin: string;
  ownerPublicKey: string;
  resourceCommitment: string;
  requestNonce: string;
  consumedAt: string;
  expiresAt: string;
  verifierPublicKeyBase64Url: string;
  signatureBase64Url: string;
};

export function serializeTinThresholdNonceReceipt(
  receipt: Omit<TinThresholdNonceReceipt, "signatureBase64Url">,
) {
  return canonicalFields([
    receipt.domain,
    receipt.operation,
    receipt.tin,
    receipt.ownerPublicKey,
    receipt.resourceCommitment.toLowerCase(),
    receipt.requestNonce,
    receipt.consumedAt,
    receipt.expiresAt,
    receipt.verifierPublicKeyBase64Url,
  ]);
}

export async function verifyTinThresholdNonceReceipt(params: {
  receipt: TinThresholdNonceReceipt;
  proof: TinDeviceAccessProof;
  expectedVerifierPublicKeyBase64Url: string;
  now?: Date;
}) {
  const receipt = params.receipt;
  if (
    receipt.domain !== TIN_THRESHOLD_NONCE_RECEIPT_DOMAIN ||
    receipt.operation !== params.proof.operation ||
    receipt.tin !== params.proof.tin ||
    receipt.ownerPublicKey !== params.proof.ownerPublicKey ||
    receipt.resourceCommitment.toLowerCase() !==
      params.proof.resourceCommitment.toLowerCase() ||
    receipt.requestNonce !== params.proof.requestNonce ||
    receipt.expiresAt !== params.proof.expiresAt ||
    receipt.verifierPublicKeyBase64Url !==
      params.expectedVerifierPublicKeyBase64Url
  ) {
    throw new Error("TIN threshold nonce receipt does not match the access proof");
  }
  const consumedAt = Date.parse(receipt.consumedAt);
  const issuedAt = Date.parse(params.proof.issuedAt);
  const expiresAt = Date.parse(receipt.expiresAt);
  const now = (params.now ?? new Date()).getTime();
  if (
    !Number.isFinite(consumedAt) ||
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    consumedAt < issuedAt - 30_000 ||
    consumedAt >= expiresAt ||
    expiresAt <= now
  ) {
    throw new Error("TIN threshold nonce receipt is expired or has an invalid time");
  }
  const publicKeyBytes = base64UrlToBytes(receipt.verifierPublicKeyBase64Url);
  if (publicKeyBytes.length !== 32) {
    throw new Error("TIN threshold nonce verifier public key is invalid");
  }
  const publicKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(publicKeyBytes),
    "Ed25519",
    false,
    ["verify"],
  );
  const unsigned = { ...receipt };
  delete (unsigned as Partial<TinThresholdNonceReceipt>).signatureBase64Url;
  const valid = await crypto.subtle.verify(
    "Ed25519",
    publicKey,
    toArrayBuffer(base64UrlToBytes(receipt.signatureBase64Url)),
    toArrayBuffer(serializeTinThresholdNonceReceipt(
      unsigned as Omit<TinThresholdNonceReceipt, "signatureBase64Url">,
    )),
  );
  if (!valid) throw new Error("TIN threshold nonce receipt signature is invalid");
  return receipt;
}
