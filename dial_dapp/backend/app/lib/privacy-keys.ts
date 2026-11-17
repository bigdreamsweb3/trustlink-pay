import { randomBytes, createHash } from "node:crypto";

import { PublicKey } from "@solana/web3.js";
import { ed25519, x25519 } from "@noble/curves/ed25519";

const ED25519_ORDER = BigInt(
  "723700557733226221397318656304299424085711635937990760600195093828545425857"
);

function sha256(data: Uint8Array) {
  return createHash("sha256").update(data).digest();
}

function concatBytes(...values: Uint8Array[]) {
  const total = values.reduce((sum, value) => sum + value.length, 0);
  const next = new Uint8Array(total);
  let offset = 0;
  for (const value of values) {
    next.set(value, offset);
    offset += value.length;
  }
  return next;
}

function base58ToBytes(value: string) {
  return new PublicKey(value).toBytes();
}

function bytesToBase58(value: Uint8Array) {
  return new PublicKey(value).toBase58();
}

function hexToBytes(value: string) {
  return Uint8Array.from(Buffer.from(value, "hex"));
}

function bytesToHex(value: Uint8Array) {
  return Buffer.from(value).toString("hex");
}

function normalizeScalar(secretKeyHex: string) {
  const raw = BigInt(`0x${secretKeyHex}`) % ED25519_ORDER;
  return raw === 0n ? 1n : raw;
}

function scalarToBytes(value: bigint) {
  const hex = value.toString(16).padStart(64, "0");
  return hexToBytes(hex);
}

function bytesToScalar(bytes: Uint8Array) {
  return normalizeScalar(bytesToHex(bytes));
}

function tweakFromSharedSecret(sharedSecret: Uint8Array) {
  return normalizeScalar(bytesToHex(sha256(sharedSecret)));
}

function canonicalizeClaimProofPayload(params: {
  paymentId: string;
  phoneIdentityPublicKey: string;
  paymentReceiverPublicKey: string;
  ephemeralPublicKey: string;
  settlementWalletPublicKey: string;
}) {
  return JSON.stringify(
    {
      paymentId: params.paymentId,
      phoneIdentityPublicKey: params.phoneIdentityPublicKey,
      paymentReceiverPublicKey: params.paymentReceiverPublicKey,
      ephemeralPublicKey: params.ephemeralPublicKey,
      settlementWalletPublicKey: params.settlementWalletPublicKey,
    },
    null,
    0
  );
}

export function generatePhoneIdentityPublicKey() {
  const seed = randomBytes(32);
  return bytesToBase58(ed25519.getPublicKey(seed));
}

export function generatePaymentIdentityPublicKey() {
  const seed = randomBytes(32);
  return bytesToBase58(ed25519.getPublicKey(seed));
}

export function generatePrivacyViewKeypair() {
  const privateKey = x25519.utils.randomSecretKey();
  return {
    publicKey: bytesToHex(x25519.getPublicKey(privateKey)),
    privateKey: bytesToHex(privateKey),
  };
}

export function generatePrivacySpendKeypair() {
  const privateKey = randomBytes(32);
  return {
    publicKey: bytesToBase58(ed25519.getPublicKey(privateKey)),
    privateKey: bytesToHex(privateKey),
  };
}

export function deriveStealthPaymentAddress(params: {
  receiverViewPublicKey: string;
  receiverSpendPublicKey: string;
}) {
  const ephemeralPrivateKey = x25519.utils.randomSecretKey();
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivateKey);
  const sharedSecret = x25519.getSharedSecret(ephemeralPrivateKey, hexToBytes(params.receiverViewPublicKey));
  const tweak = tweakFromSharedSecret(sharedSecret);
  const spendPoint = ed25519.Point.fromHex(base58ToBytes(params.receiverSpendPublicKey));
  const derivedPoint = spendPoint.add(ed25519.Point.BASE.multiply(tweak));

  return {
    paymentReceiverPublicKey: bytesToBase58(derivedPoint.toBytes()),
    ephemeralPublicKey: bytesToHex(ephemeralPublicKey),
  };
}

export function derivePaymentReceiverPublicKey(params: {
  privacyViewPrivateKey: string;
  privacySpendPublicKey: string;
  ephemeralPublicKey: string;
}) {
  const sharedSecret = x25519.getSharedSecret(
    hexToBytes(params.privacyViewPrivateKey),
    hexToBytes(params.ephemeralPublicKey)
  );
  const tweak = tweakFromSharedSecret(sharedSecret);
  const spendPoint = ed25519.Point.fromHex(base58ToBytes(params.privacySpendPublicKey));
  const derivedPoint = spendPoint.add(ed25519.Point.BASE.multiply(tweak));

  return {
    paymentReceiverPublicKey: bytesToBase58(derivedPoint.toBytes()),
  };
}

export function deriveReceiverPrivateKey(params: {
  privacyViewPrivateKey: string;
  privacySpendPrivateKey: string;
  ephemeralPublicKey: string;
}) {
  const sharedSecret = x25519.getSharedSecret(
    hexToBytes(params.privacyViewPrivateKey),
    hexToBytes(params.ephemeralPublicKey)
  );
  const tweak = tweakFromSharedSecret(sharedSecret);
  const spendScalar = bytesToScalar(hexToBytes(params.privacySpendPrivateKey));
  const receiverScalar = (spendScalar + tweak) % ED25519_ORDER;

  return bytesToHex(scalarToBytes(receiverScalar));
}

export function createClaimProofMessage(params: {
  paymentId: string;
  phoneIdentityPublicKey: string;
  paymentReceiverPublicKey: string;
  ephemeralPublicKey: string;
  settlementWalletPublicKey: string;
}) {
  return new TextEncoder().encode(canonicalizeClaimProofPayload(params));
}

export function signClaimProof(params: {
  privacySpendPrivateKey: string;
  paymentId: string;
  phoneIdentityPublicKey: string;
  paymentReceiverPublicKey: string;
  ephemeralPublicKey: string;
  settlementWalletPublicKey: string;
}) {
  const message = createClaimProofMessage(params);
  const signature = ed25519.sign(message, hexToBytes(params.privacySpendPrivateKey));

  return bytesToHex(signature);
}

export function verifyClaimProof(params: {
  privacySpendPublicKey: string;
  privacySpendSignature: string;
  paymentId: string;
  phoneIdentityPublicKey: string;
  paymentReceiverPublicKey: string;
  ephemeralPublicKey: string;
  settlementWalletPublicKey: string;
}) {
  const message = createClaimProofMessage(params);
  return ed25519.verify(
    hexToBytes(params.privacySpendSignature),
    message,
    base58ToBytes(params.privacySpendPublicKey)
  );
}

export function createBindingSignaturePayload(params: {
  phoneIdentityPublicKey: string;
  privacyViewPublicKey: string;
  privacySpendPublicKey: string;
  settlementWalletPublicKey: string;
  recoveryWalletPublicKey?: string | null;
}) {
  return new TextEncoder().encode(
    JSON.stringify(
      {
        phoneIdentityPublicKey: params.phoneIdentityPublicKey,
        privacyViewPublicKey: params.privacyViewPublicKey,
        privacySpendPublicKey: params.privacySpendPublicKey,
        settlementWalletPublicKey: params.settlementWalletPublicKey,
        recoveryWalletPublicKey: params.recoveryWalletPublicKey ?? null,
      },
      null,
      0
    )
  );
}

export function hashBindingSignaturePayload(params: {
  phoneIdentityPublicKey: string;
  privacyViewPublicKey: string;
  privacySpendPublicKey: string;
  settlementWalletPublicKey: string;
  recoveryWalletPublicKey?: string | null;
}) {
  return bytesToHex(sha256(createBindingSignaturePayload(params)));
}
