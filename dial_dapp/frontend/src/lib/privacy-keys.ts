"use client";

import { PublicKey } from "@solana/web3.js";
import { ed25519, x25519 } from "@noble/curves/ed25519";

const STORAGE_KEY = "trustlink:privacy-key-bundle:v1";

function bytesToHex(value: Uint8Array) {
  return Array.from(value, (entry) => entry.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function bytesToBase58(value: Uint8Array) {
  return new PublicKey(value).toBase58();
}

export type PrivacyKeyBundle = {
  phoneIdentityPublicKey: string;
  privacyViewPublicKey: string;
  privacyViewPrivateKey: string;
  privacySpendPublicKey: string;
  privacySpendPrivateKey: string;
};

export function loadPrivacyKeyBundle() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as PrivacyKeyBundle;
}

export function generatePrivacyKeyBundle(): PrivacyKeyBundle {
  const phoneIdentitySeed = crypto.getRandomValues(new Uint8Array(32));
  const privacyViewPrivateKey = x25519.utils.randomSecretKey();
  const privacySpendPrivateKey = crypto.getRandomValues(new Uint8Array(32));

  return {
    phoneIdentityPublicKey: bytesToBase58(ed25519.getPublicKey(phoneIdentitySeed)),
    privacyViewPublicKey: bytesToHex(x25519.getPublicKey(privacyViewPrivateKey)),
    privacyViewPrivateKey: bytesToHex(privacyViewPrivateKey),
    privacySpendPublicKey: bytesToBase58(ed25519.getPublicKey(privacySpendPrivateKey)),
    privacySpendPrivateKey: bytesToHex(privacySpendPrivateKey),
  };
}

export function savePrivacyKeyBundle(bundle: PrivacyKeyBundle) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
}

export function getOrCreatePrivacyKeyBundle() {
  const existing = loadPrivacyKeyBundle();
  if (existing) {
    return existing;
  }

  const created = generatePrivacyKeyBundle();
  savePrivacyKeyBundle(created);
  return created;
}

const ED25519_ORDER = BigInt(
  "723700557733226221397318656304299424085711635937990760600195093828545425857"
);

function scalarToHex(value: bigint) {
  return value.toString(16).padStart(64, "0");
}

function hexToScalar(value: string) {
  const scalar = BigInt(`0x${value}`) % ED25519_ORDER;
  return scalar === 0n ? 1n : scalar;
}

export async function derivePaymentReceiverPublicKey(params: {
  privacyViewPrivateKey: string;
  privacySpendPublicKey: string;
  ephemeralPublicKey: string;
}) {
  const sharedSecret = x25519.getSharedSecret(
    hexToBytes(params.privacyViewPrivateKey),
    hexToBytes(params.ephemeralPublicKey)
  );
  const tweakHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new Uint8Array(sharedSecret).buffer)
  );
  const tweak = BigInt(`0x${bytesToHex(tweakHash)}`) % ED25519_ORDER;
  const spendPoint = ed25519.Point.fromHex(new PublicKey(params.privacySpendPublicKey).toBytes());
  const derivedPoint = spendPoint.add(ed25519.Point.BASE.multiply(tweak));

  return bytesToBase58(derivedPoint.toBytes());
}

export async function deriveReceiverPrivateKey(params: {
  privacyViewPrivateKey: string;
  privacySpendPrivateKey: string;
  ephemeralPublicKey: string;
}) {
  const sharedSecret = x25519.getSharedSecret(
    hexToBytes(params.privacyViewPrivateKey),
    hexToBytes(params.ephemeralPublicKey)
  );
  const tweakHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new Uint8Array(sharedSecret).buffer)
  );
  const tweak = BigInt(`0x${bytesToHex(tweakHash)}`) % ED25519_ORDER;
  const receiverScalar = (hexToScalar(params.privacySpendPrivateKey) + tweak) % ED25519_ORDER;
  return scalarToHex(receiverScalar === 0n ? 1n : receiverScalar);
}

export function createClaimProofMessage(params: {
  paymentId: string;
  phoneIdentityPublicKey: string;
  paymentReceiverPublicKey: string;
  ephemeralPublicKey: string;
  settlementWalletPublicKey: string;
}) {
  return new TextEncoder().encode(
    JSON.stringify(
      {
        paymentId: params.paymentId,
        phoneIdentityPublicKey: params.phoneIdentityPublicKey,
        paymentReceiverPublicKey: params.paymentReceiverPublicKey,
        ephemeralPublicKey: params.ephemeralPublicKey,
        settlementWalletPublicKey: params.settlementWalletPublicKey,
      },
      null,
      0
    )
  );
}

export function signClaimProof(params: {
  privacySpendPrivateKey: string;
  paymentId: string;
  phoneIdentityPublicKey: string;
  paymentReceiverPublicKey: string;
  ephemeralPublicKey: string;
  settlementWalletPublicKey: string;
}) {
  return bytesToHex(
    ed25519.sign(createClaimProofMessage(params), hexToBytes(params.privacySpendPrivateKey))
  );
}
