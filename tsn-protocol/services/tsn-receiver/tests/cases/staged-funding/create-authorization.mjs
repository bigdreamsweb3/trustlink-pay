import { generateKeyPairSync, sign } from "node:crypto";
import { caseEncodeFixtureBase58 as encodeFixtureBase58 } from "../contracts/encode-fixture-base58.mjs";

/** Synthetic owner message signature; no chain transaction is built or submitted. */
export function createAuthorization(paymentId = "synthetic-staged-payment") {
  const keys = generateKeyPairSync("ed25519");
  const wallet = encodeFixtureBase58(keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32));
  const message = `Synthetic staged payment authorization ${paymentId}`;
  return { paymentId, recipientHash: "synthetic-recipient-hash", recipientTin: "1234567890",
    tokenMintAddress: "synthetic-mint", amount: 1, recipientAmount: 0.9, senderFeeAmount: 0.1,
    senderWallet: wallet, senderAuthorizationMessage: message,
    senderAuthorizationSignature: sign(null, Buffer.from(message), keys.privateKey).toString("base64"),
    senderAuthorizationNonce: `nonce-${paymentId}`, senderAuthorizationIssuedAt: new Date().toISOString(),
    senderAuthorizationExpiresAt: new Date(Date.now() + 900000).toISOString(), senderFundingMode: "tcap_funded_note_v1",
    fundingNote: { version: 1, secret: "00".repeat(31) + "01", blinding: "00".repeat(31) + "02", commitment: "00".repeat(31) + "03" } };
}
