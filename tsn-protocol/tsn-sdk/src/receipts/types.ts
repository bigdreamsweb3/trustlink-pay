export const TSN_PRIVATE_RECEIPT_PROTOCOL_VERSION = "tsn-private-receipt-v1";
export const TSN_PRIVATE_RECEIPT_ENCRYPTION_VERSION = "aes-256-gcm+x25519-hkdf-sha256-v1";

export type ReceiptKeyRecipientType = "device" | "recovery";

export interface ReceiptKeyEnvelope {
  recipientKeyId: string;
  recipientType: ReceiptKeyRecipientType;
  wrappedDek: string;
  algorithm: "x25519-hkdf-sha256-aes-256-gcm-v1";
  ephemeralPublicKey: JsonWebKey;
  nonce: string;
  createdAt: string;
  revokedAt?: string;
}

export interface EncryptedReceiptRecord {
  receiptId: string;
  operationId: string;
  tinCommitment: string;
  protocolVersion: typeof TSN_PRIVATE_RECEIPT_PROTOCOL_VERSION;
  ciphertext: string;
  nonce: string;
  authenticationTag: string;
  encryptionVersion: typeof TSN_PRIVATE_RECEIPT_ENCRYPTION_VERSION;
  aadCommitment: string;
  integrityCommitment: string;
  keyEnvelopes: ReceiptKeyEnvelope[];
  createdAt: string;
}

export interface ReceiptEncryptionRecipient {
  recipientKeyId: string;
  recipientType: ReceiptKeyRecipientType;
  encryptionPublicKey: JsonWebKey;
}

export interface PrivateReceiptAad {
  protocolVersion: typeof TSN_PRIVATE_RECEIPT_PROTOCOL_VERSION;
  receiptId: string;
  operationId: string;
  tinCommitment: string;
  encryptionVersion: typeof TSN_PRIVATE_RECEIPT_ENCRYPTION_VERSION;
}
