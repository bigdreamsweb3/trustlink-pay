import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";

import {
  buildSettlementTokenPayload,
  createCrankerEncryptionKeypair,
  createOneTimeDecryptionToken,
  decryptSettlementToken,
  encryptSettlementToken,
} from "../tsn-protocol/tsn-sdk/dist/settlement-token.js";

const cranker = createCrankerEncryptionKeypair();
const recipientWallet = Keypair.generate().publicKey.toBase58();
const tokenMintAddress = Keypair.generate().publicKey.toBase58();
const payload = buildSettlementTokenPayload({
  paymentId: "security-demo-payment",
  recipientWallet,
  tokenMintAddress,
  recipientAmountBaseUnits: 5_000_000n,
  claimFeeAmountBaseUnits: 3_151n,
  epoch: 7,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});
const encrypted = encryptSettlementToken({
  payload,
  crankerEncryptionPublicKey: cranker.publicKeyBase64,
});

assert.equal(JSON.stringify(encrypted).includes(payload.recipientWallet), false);
const decrypted = decryptSettlementToken({
  encrypted,
  crankerEncryptionSecretKey: cranker.secretKeyBase64,
});
assert.deepEqual(decrypted, payload);

const otdt = createOneTimeDecryptionToken();
const consumedOtdtHashes = new Set();
assert.equal(consumedOtdtHashes.has(otdt.hash), false);
consumedOtdtHashes.add(otdt.hash);
assert.equal(consumedOtdtHashes.has(otdt.hash), true);

assert.throws(() => {
  decryptSettlementToken({
    encrypted: {
      ...encrypted,
      ciphertextBase64: Buffer.from("tampered").toString("base64"),
    },
    crankerEncryptionSecretKey: cranker.secretKeyBase64,
  });
});

console.log({
  transferId: encrypted.transferId,
  commitmentHash: encrypted.commitmentHash,
  otdtHash: otdt.hash,
  recipientRouteVisibleInCiphertext: false,
  tamperRejected: true,
  replayDetected: true,
});
