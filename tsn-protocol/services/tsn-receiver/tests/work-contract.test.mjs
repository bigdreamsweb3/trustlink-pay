import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { assertExternalWorkKind, assertAuthorizedFundingIngress, compactAuthorizedFundingVerification, createReceivedWork, publicCoordinationPayload } from "../lib/work-contract.ts";

function base58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let output = "";
  while (number) { const remainder = Number(number % 58n); output = alphabet[remainder] + output; number /= 58n; }
  for (const byte of bytes) { if (byte === 0) output = `1${output}`; else break; }
  return output;
}

test("receiver accepts only public work and creates monotonic initial state", () => {
  const work = createReceivedWork({
    id: "intent-1",
    kind: "AUTHORIZED_FUNDING",
    payload: { paymentId: "p", recipientHash: "h" },
  });
  assert.equal(work.status, "RECEIVED");
  assert.equal(work.stateVersion, 1);
  assert.match(work.payloadCommitment, /^[a-f0-9]{64}$/);
});

test("receiver rejects fields outside the durable allowlist, regardless of their name", () => {
  assert.throws(() => createReceivedWork({
    kind: "AUTHORIZED_FUNDING",
    payload: { paymentId: "p", totallyDifferentSecret: "unsafe" },
  }), /UNSUPPORTED_PAYLOAD_FIELD/);
  assert.throws(() => createReceivedWork({
    kind: "SETTLEMENT",
    payload: { master_seed: "unsafe" },
  }), /UNSUPPORTED_PAYLOAD_FIELD/);
});

test("funding work rejects plaintext TIN in its durable payload", () => {
  assert.throws(() => createReceivedWork({
    kind: "AUTHORIZED_FUNDING",
    payload: { paymentId: "p", recipientHash: "h", recipientTin: "1234567890" },
  }), /UNSUPPORTED_PAYLOAD_FIELD/);
});


test("TIN ingress accepts the current V1 shape and rejects retired or plaintext fields", () => {
  const payload = {
    intentType: "tin_creation",
    intentId: "operation-1",
    ownerPubkey: "owner",
    ownerSignature: "signature",
    ownerIntentHash: "hash",
    ownerIntentMessage: "approval",
    nonce: "nonce",
    expiry: 1,
    lookupCommitment: "commitment",
    lookupIssuanceProof: "proof",
    encryptedIdentityEnvelope: "identity",
    encryptedTinRecovery: "recovery",
    encryptedMasterSeed: "seed",
    encryptedMetadataHash: "metadata",
    routeVersion: 1,
    routeNonce: "route-nonce",
    tipRouteVersion: 1,
    gpruElgamalKeyVersion: 1,
    gpruElgamalPublicKey: "gpru-elgamal-public-key",
    gpruElgamalKeyCommitment: "gpru-elgamal-commitment",
    policyCommitment: "policy",
  };
  assert.equal(createReceivedWork({ kind: "TIN_OPERATION", payload }).status, "RECEIVED");
  for (const obsolete of ["programAssigned", "tin", "displayName", "pruConfigurationHash", "encryptedPublicRouteEnvelope"]) {
    assert.throws(
      () => createReceivedWork({ kind: "TIN_OPERATION", payload: { ...payload, [obsolete]: "legacy" } }),
      /UNSUPPORTED_PAYLOAD_FIELD/,
    );
  }
});

test("canonical commitment is independent of object insertion order", () => {
  const first = createReceivedWork({ kind: "SETTLEMENT", payload: { paymentId: "p", intentId: "i", recipientHash: "h", source: "test" } });
  const second = createReceivedWork({ kind: "SETTLEMENT", payload: { source: "test", recipientHash: "h", intentId: "i", paymentId: "p" } });
  assert.equal(first.payloadCommitment, second.payloadCommitment);
});

test("coordination views never include the encrypted envelope", () => {
  const work = createReceivedWork({ kind: "AUTHORIZED_FUNDING", payload: { paymentId: "p", recipientHash: "h", nodeEncryptedPayload: { version: 1, iv: "i", ciphertext: "c", tag: "t" } } });
  assert.deepEqual(publicCoordinationPayload(work), { paymentId: "p", recipientHash: "h" });
});

test("funding verification compaction never persists recipient TIN or sender authorization", () => {
  const payload = { paymentId: "p", recipientHash: "h", tokenMintAddress: "m", amount: 1 };
  const compact = compactAuthorizedFundingVerification(payload, {
    verificationType: "TSN_TCAP_V2_GPRU_CREDIT_INTENT",
    verifiedPayload: {
      ...payload,
      recipientTin: "1234567890",
      senderAuthorizationMessage: "Recipient TIN: 1234567890",
      senderAuthorizationSignature: "signature",
      senderWallet: "wallet",
      senderSignedFundingTransaction: "signed-transaction",
      senderFundingMode: "tcap_deposit_v2",
      tcapCreditTransition: { nullifier: "private-transition-data" },
    },
  });
  assert.deepEqual(compact.payloadDelta, {
    addedFields: { senderSignedFundingTransaction: "signed-transaction", senderFundingMode: "tcap_deposit_v2" },
    changedFields: {},
    removedFields: [],
  });
  assert.doesNotMatch(JSON.stringify(compact), /1234567890|senderAuthorization|senderWallet|tcapCreditTransition/);
});

test("public coordination filters recipient TIN from legacy verification records", () => {
  const work = createReceivedWork({ kind: "AUTHORIZED_FUNDING", payload: { paymentId: "p", recipientHash: "h" } });
  const legacyWork = {
    ...work,
    verification: { verifiedPayload: { paymentId: "p", recipientHash: "h", recipientTin: "1234567890", privacyVersion: 1 } },
  };
  assert.deepEqual(publicCoordinationPayload(legacyWork), { paymentId: "p", recipientHash: "h" });
});


test("payment ingress requires a valid sender Ed25519 authorization", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  const wallet = base58(der.subarray(-32));
  const message = "TSN payment authorization";
  const payload = { paymentId: "p", recipientHash: "h", recipientTin: "1234567890", tokenMintAddress: "m", amount: 1, senderWallet: wallet, senderAuthorizationMessage: message, senderAuthorizationSignature: sign(null, Buffer.from(message), privateKey).toString("base64"), senderAuthorizationNonce: "n", senderFundingMode: "tcap_deposit_v2", senderSignedFundingTransaction: "base64-serialized-owner-signed-transaction" };
  assert.doesNotThrow(() => assertAuthorizedFundingIngress(payload));
  assert.throws(() => assertAuthorizedFundingIngress({ ...payload, senderAuthorizationSignature: Buffer.alloc(64).toString("base64") }), /INVALID_SENDER_SIGNATURE/);
  for (const obsolete of ["pruSpendTin", "pruSpendSelections", "walletTopUpAmountBaseUnits", "privacyVersion", "senderTokenAccount", "encryptedSettlementToken"]) {
    assert.throws(
      () => assertAuthorizedFundingIngress({ ...payload, [obsolete]: "legacy" }),
      /UNSUPPORTED_PAYLOAD_FIELD/,
    );
  }
});

test("public Receiver ingress cannot create settlement or recovery work", () => {
  assert.throws(() => assertExternalWorkKind("SETTLEMENT"), /SETTLEMENT_WORK_INTERNAL_ONLY/);
  assert.doesNotThrow(() => assertExternalWorkKind("AUTHORIZED_FUNDING"));
});
