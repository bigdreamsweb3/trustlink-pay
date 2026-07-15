import test from "node:test";
import assert from "node:assert/strict";

import { detectHistoricalPrivateRecords, getRecoveryOptions } from "../dist/recovery/index.js";
import { generateNonExportableEncryptionCredential } from "../dist/receipts/internal/device-encryption-key.js";
import { decryptPrivateReceiptForAuthorizedKey, encryptPrivateReceipt, rewrapPrivateReceiptDek } from "../dist/receipts/internal/receipt-envelope.js";

test("new device sees a clear recovery-required state instead of blank history", () => {
  assert.deepEqual(detectHistoricalPrivateRecords({
    historicalReceiptCount: 12,
    accessibleHistoricalReceiptCount: 0,
    activeApprovingDeviceCount: 1,
    activeRecoveryCredentialCount: 1,
  }), {
    status: "recovery-required",
    message: "Historical private records found. Authorize secure recovery to restore access on this device.",
  });
});

test("recovery options prioritize an existing authorized device", () => {
  assert.deepEqual(getRecoveryOptions({
    historicalReceiptCount: 12,
    accessibleHistoricalReceiptCount: 0,
    activeApprovingDeviceCount: 1,
    activeRecoveryCredentialCount: 1,
  }).map((option) => [option.method, option.recommended]), [
    ["authorized-device", true],
    ["recovery-credential", false],
  ]);
});

test("unrecoverable history is explicit while future records remain possible", () => {
  assert.equal(detectHistoricalPrivateRecords({
    historicalReceiptCount: 4,
    accessibleHistoricalReceiptCount: 0,
    activeApprovingDeviceCount: 0,
    activeRecoveryCredentialCount: 0,
  }).status, "recovery-unavailable");
});

test("existing authorized device rewraps a DEK without changing receipt ciphertext", async () => {
  const existingDevice = await generateNonExportableEncryptionCredential("device");
  const newDevice = await generateNonExportableEncryptionCredential("device");
  const plaintext = new TextEncoder().encode('{"private":"history"}');
  const record = await encryptPrivateReceipt({
    receiptId: "receipt-history-1",
    operationId: "operation-history-1",
    tinCommitment: "tin-commitment",
    plaintext,
    recipients: [{ recipientKeyId: existingDevice.keyId, recipientType: "device", encryptionPublicKey: existingDevice.publicKey }],
  });

  await assert.rejects(decryptPrivateReceiptForAuthorizedKey({
    record,
    recipientKeyId: newDevice.keyId,
    recipientPrivateKey: newDevice.privateKey,
  }));

  const newEnvelope = await rewrapPrivateReceiptDek({
    record,
    approvingRecipientKeyId: existingDevice.keyId,
    approvingRecipientPrivateKey: existingDevice.privateKey,
    newRecipient: { recipientKeyId: newDevice.keyId, recipientType: "device", encryptionPublicKey: newDevice.publicKey },
  });
  const recoveredRecord = { ...record, keyEnvelopes: [...record.keyEnvelopes, newEnvelope] };
  const restored = await decryptPrivateReceiptForAuthorizedKey({
    record: recoveredRecord,
    recipientKeyId: newDevice.keyId,
    recipientPrivateKey: newDevice.privateKey,
  });

  assert.equal(new TextDecoder().decode(restored), new TextDecoder().decode(plaintext));
  assert.equal(recoveredRecord.ciphertext, record.ciphertext);
  assert.equal(recoveredRecord.authenticationTag, record.authenticationTag);
});

test("owner recovery credential can receive an independent receipt envelope", async () => {
  const device = await generateNonExportableEncryptionCredential("device");
  const recovery = await generateNonExportableEncryptionCredential("recovery");
  const record = await encryptPrivateReceipt({
    receiptId: "receipt-recovery-1",
    operationId: "operation-recovery-1",
    tinCommitment: "tin-commitment",
    plaintext: new TextEncoder().encode("protected"),
    recipients: [
      { recipientKeyId: device.keyId, recipientType: "device", encryptionPublicKey: device.publicKey },
      { recipientKeyId: recovery.keyId, recipientType: "recovery", encryptionPublicKey: recovery.publicKey },
    ],
  });
  const restored = await decryptPrivateReceiptForAuthorizedKey({ record, recipientKeyId: recovery.keyId, recipientPrivateKey: recovery.privateKey });
  assert.equal(new TextDecoder().decode(restored), "protected");
});
