import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";

import {
  buildSettlementTokenPayload,
  computeSettlementCommitment,
  createCrankerEncryptionKeypair,
  createOneTimeDecryptionToken,
  decryptSettlementToken,
  encryptSettlementToken,
} from "../dist/settlement-token.js";

test("settlement routes decrypt only with the matching Cranker key", () => {
  const cranker = createCrankerEncryptionKeypair();
  const wrongCranker = createCrankerEncryptionKeypair();
  const recipientWallet = Keypair.generate().publicKey.toBase58();
  const tokenMintAddress = Keypair.generate().publicKey.toBase58();
  const payload = buildSettlementTokenPayload({
    paymentId: "sdk-private-route",
    recipientWallet,
    tokenMintAddress,
    recipientAmountBaseUnits: 1_000_000n,
    epoch: 9,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const encrypted = encryptSettlementToken({
    payload,
    crankerEncryptionPublicKey: cranker.publicKeyBase64,
  });

  assert.equal(JSON.stringify(encrypted).includes(payload.recipientWallet), false);
  assert.deepEqual(
    decryptSettlementToken({
      encrypted,
      crankerEncryptionSecretKey: cranker.secretKeyBase64,
    }),
    payload,
  );
  assert.throws(() =>
    decryptSettlementToken({
      encrypted,
      crankerEncryptionSecretKey: wrongCranker.secretKeyBase64,
    }),
  );
});

test("OTDT generation produces unique one-time commitments", () => {
  const first = createOneTimeDecryptionToken();
  const second = createOneTimeDecryptionToken();
  assert.notEqual(first.hash, second.hash);
  assert.equal(first.token.length, 32);
  assert.equal(second.token.length, 32);
});

test("settlement commitment binds the complete payout route", () => {
  const payload = buildSettlementTokenPayload({
    paymentId: "sdk-commitment-route",
    recipientWallet: Keypair.generate().publicKey.toBase58(),
    tokenMintAddress: Keypair.generate().publicKey.toBase58(),
    recipientAmountBaseUnits: 2_000_000n,
    claimFeeAmountBaseUnits: 3_151n,
    epoch: 11,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const original = computeSettlementCommitment(payload);

  assert.notEqual(
    original,
    computeSettlementCommitment({
      ...payload,
      recipientAmountBaseUnits: "2000001",
    }),
  );
  assert.notEqual(
    original,
    computeSettlementCommitment({
      ...payload,
      recipientWallet: Keypair.generate().publicKey.toBase58(),
    }),
  );
});
