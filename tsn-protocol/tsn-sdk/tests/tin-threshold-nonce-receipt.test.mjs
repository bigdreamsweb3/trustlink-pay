import assert from "node:assert/strict";
import { test } from "node:test";

import {
  serializeTinThresholdNonceReceipt,
  verifyTinThresholdNonceReceipt,
} from "../dist/tin-threshold-nonce-receipt.js";

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function fixture(now = new Date()) {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const verifierPublicKeyBase64Url = b64url(
    new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey)),
  );
  const proof = {
    operation: "RELEASE_KEY",
    tin: "1000000008",
    ownerPublicKey: "owner",
    resourceCommitment: "1".repeat(64),
    requestNonce: "nonce",
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 300_000).toISOString(),
  };
  const unsigned = {
    domain: "TSN_TIN_THRESHOLD_NONCE_RECEIPT",
    operation: proof.operation,
    tin: proof.tin,
    ownerPublicKey: proof.ownerPublicKey,
    resourceCommitment: proof.resourceCommitment,
    requestNonce: proof.requestNonce,
    consumedAt: new Date(now.getTime() + 1_000).toISOString(),
    expiresAt: proof.expiresAt,
    verifierPublicKeyBase64Url,
  };
  const signature = await crypto.subtle.sign(
    "Ed25519",
    keys.privateKey,
    serializeTinThresholdNonceReceipt(unsigned),
  );
  return {
    proof,
    expectedVerifierPublicKeyBase64Url: verifierPublicKeyBase64Url,
    receipt: { ...unsigned, signatureBase64Url: b64url(new Uint8Array(signature)) },
  };
}

test("signed nonce receipt is bound to the exact device proof", async () => {
  const value = await fixture();
  await verifyTinThresholdNonceReceipt(value);
  await assert.rejects(
    verifyTinThresholdNonceReceipt({
      ...value,
      proof: { ...value.proof, requestNonce: "different" },
    }),
    /does not match/,
  );
});

test("nonce receipt rejects the wrong verifier and signature tampering", async () => {
  const value = await fixture();
  await assert.rejects(
    verifyTinThresholdNonceReceipt({
      ...value,
      expectedVerifierPublicKeyBase64Url: b64url(new Uint8Array(32)),
    }),
    /does not match/,
  );
  await assert.rejects(
    verifyTinThresholdNonceReceipt({
      ...value,
      receipt: { ...value.receipt, signatureBase64Url: b64url(new Uint8Array(64)) },
    }),
    /signature is invalid/,
  );
});
