import test from "node:test";
import assert from "node:assert/strict";

import { generateNonExportableEncryptionCredential } from "../dist/receipts/internal/device-encryption-key.js";
import { decryptPrivateReceiptForAuthorizedKey, encryptPrivateReceipt } from "../dist/receipts/internal/receipt-envelope.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function receipt() {
  return encoder.encode(JSON.stringify({ receiptId: "receipt-1", operationId: "operation-1", transactionSignature: "private-signature", settlementWallet: "private-wallet" }));
}

async function createRecord(recipient) {
  return encryptPrivateReceipt({
    receiptId: "receipt-1",
    operationId: "operation-1",
    tinCommitment: "tin-commitment-1",
    plaintext: receipt(),
    recipients: [{ recipientKeyId: recipient.keyId, recipientType: "device", encryptionPublicKey: recipient.publicKey }],
    createdAt: "2026-07-14T00:00:00.000Z",
  });
}

test("platform ciphertext does not decrypt without an owner-authorized private key", async () => {
  const ownerDevice = await generateNonExportableEncryptionCredential("device");
  const platformKey = await generateNonExportableEncryptionCredential("device");
  const record = await createRecord(ownerDevice);
  await assert.rejects(decryptPrivateReceiptForAuthorizedKey({ record, recipientKeyId: ownerDevice.keyId, recipientPrivateKey: platformKey.privateKey }));
});

test("authorized device decrypts its receipt envelope", async () => {
  const ownerDevice = await generateNonExportableEncryptionCredential("device");
  const record = await createRecord(ownerDevice);
  const plaintext = await decryptPrivateReceiptForAuthorizedKey({ record, recipientKeyId: ownerDevice.keyId, recipientPrivateKey: ownerDevice.privateKey });
  assert.deepEqual(JSON.parse(decoder.decode(plaintext)), JSON.parse(decoder.decode(receipt())));
});

test("wrong device cannot unwrap an owner device envelope", async () => {
  const ownerDevice = await generateNonExportableEncryptionCredential("device");
  const wrongDevice = await generateNonExportableEncryptionCredential("device");
  const record = await createRecord(ownerDevice);
  await assert.rejects(decryptPrivateReceiptForAuthorizedKey({ record, recipientKeyId: ownerDevice.keyId, recipientPrivateKey: wrongDevice.privateKey }));
});

test("receipt authentication tag tampering fails", async () => {
  const ownerDevice = await generateNonExportableEncryptionCredential("device");
  const record = await createRecord(ownerDevice);
  const changedTag = Buffer.from(record.authenticationTag, "base64url");
  changedTag[0] ^= 1;
  const tampered = { ...record, authenticationTag: changedTag.toString("base64url") };
  await assert.rejects(decryptPrivateReceiptForAuthorizedKey({ record: tampered, recipientKeyId: ownerDevice.keyId, recipientPrivateKey: ownerDevice.privateKey }));
});

test("receipt authenticated context tampering fails", async () => {
  const ownerDevice = await generateNonExportableEncryptionCredential("device");
  const record = await createRecord(ownerDevice);
  const tampered = { ...record, operationId: "operation-2" };
  await assert.rejects(decryptPrivateReceiptForAuthorizedKey({ record: tampered, recipientKeyId: ownerDevice.keyId, recipientPrivateKey: ownerDevice.privateKey }));
});

test("each receipt uses fresh encryption and wrapping material", async () => {
  const ownerDevice = await generateNonExportableEncryptionCredential("device");
  const first = await createRecord(ownerDevice);
  const second = await createRecord(ownerDevice);
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.keyEnvelopes[0].wrappedDek, second.keyEnvelopes[0].wrappedDek);
});
