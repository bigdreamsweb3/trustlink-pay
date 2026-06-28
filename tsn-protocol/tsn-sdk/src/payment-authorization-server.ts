import { createPublicKey, verify } from "node:crypto";

import { PublicKey } from "@solana/web3.js";
import { computeTsnDomain, type TsnScopedPruIntent } from "./pru.js";

function solanaPublicKeyToEd25519Spki(publicKey: PublicKey) {
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  return Buffer.concat([spkiPrefix, publicKey.toBuffer()]);
}

export async function verifySenderPaymentAuthorization(params: {
  senderWallet: string;
  signatureBase64: string;
  message: string;
}) {
  const publicKey = new PublicKey(params.senderWallet);
  const keyObject = createPublicKey({
    key: solanaPublicKeyToEd25519Spki(publicKey),
    format: "der",
    type: "spki",
  });

  return verify(null, Buffer.from(params.message), keyObject, Buffer.from(params.signatureBase64, "base64"));
}

export function validatePruSpendForCranker(params: {
  intent: TsnScopedPruIntent;
  tsnVaultPubkey: string;
  mainWalletSpendProofVerified: boolean;
  identityBindingMainWallet: string;
  pruSpendGuard: {
    tin: string | number | bigint;
    pruIndex: number;
    nonceBitmask: Uint8Array;
    active: boolean;
  };
  seenIntentIds: Set<string>;
  nowUnixSeconds?: number;
}) {
  if (params.intent.message.tsn_domain !== computeTsnDomain(params.tsnVaultPubkey)) {
    throw new Error("TSN domain mismatch: fake TrustLink TSN vault rejected");
  }
  if (!params.mainWalletSpendProofVerified || !params.identityBindingMainWallet) {
    throw new Error("Main wallet spend proof was not verified against IdentityBinding");
  }
  if (params.intent.message.tin !== String(params.pruSpendGuard.tin)) {
    throw new Error("Cross-TIN PRU spend rejected");
  }
  if (params.seenIntentIds.has(params.intent.message.intent_id)) {
    throw new Error("Replayed PRU intent_id rejected");
  }
  const nonce = params.intent.message.nonce;
  if (!Number.isInteger(nonce) || nonce < 0 || nonce > 255) {
    throw new Error("Invalid PRU nonce");
  }
  const byteIndex = Math.floor(nonce / 8);
  const bit = 1 << (nonce % 8);
  if ((params.pruSpendGuard.nonceBitmask[byteIndex] & bit) !== 0) {
    throw new Error("Replayed PRU nonce rejected");
  }
  if (params.intent.message.expiry <= (params.nowUnixSeconds ?? Math.floor(Date.now() / 1000))) {
    throw new Error("Expired PRU intent rejected");
  }
  if (!params.pruSpendGuard.active) {
    throw new Error("Inactive PRU spend guard rejected");
  }
  return true;
}
