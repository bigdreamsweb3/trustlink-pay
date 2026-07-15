import type {
  EncryptedReceiptRecord,
  ReceiptEncryptionRecipient,
  ReceiptKeyEnvelope,
} from "../types.js";
import {
  TSN_PRIVATE_RECEIPT_ENCRYPTION_VERSION,
  TSN_PRIVATE_RECEIPT_PROTOCOL_VERSION,
} from "../types.js";
import { base64UrlToBytes, bytesToBase64Url, canonicalFields, sha256Hex, toArrayBuffer } from "./encoding.js";
import { createPrivateReceiptAad, serializePrivateReceiptAad } from "./receipt-aad.js";

const AES_KEY_BYTES = 32;
const GCM_NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;
const WRAP_INFO = new TextEncoder().encode("TSN_RECEIPT_DEK_WRAP_V1");

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function splitCiphertextAndTag(combined: Uint8Array) {
  return {
    ciphertext: combined.slice(0, combined.length - GCM_TAG_BYTES),
    authenticationTag: combined.slice(combined.length - GCM_TAG_BYTES),
  };
}

function combineCiphertextAndTag(ciphertext: Uint8Array, authenticationTag: Uint8Array) {
  const combined = new Uint8Array(ciphertext.length + authenticationTag.length);
  combined.set(ciphertext);
  combined.set(authenticationTag, ciphertext.length);
  return combined;
}

async function importX25519PublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "X25519" }, false, []);
}

async function deriveWrappingKey(params: {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  salt: Uint8Array;
  recipientKeyId: string;
}): Promise<CryptoKey> {
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "X25519", public: params.publicKey },
      params.privateKey,
      256,
    ),
  );

  try {
    const hkdfKey = await crypto.subtle.importKey("raw", toArrayBuffer(sharedSecret), "HKDF", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: toArrayBuffer(params.salt),
        info: toArrayBuffer(canonicalFields([
          new TextDecoder().decode(WRAP_INFO),
          params.recipientKeyId,
        ])),
      },
      hkdfKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    sharedSecret.fill(0);
  }
}

async function wrapDek(params: {
  dek: Uint8Array;
  recipient: ReceiptEncryptionRecipient;
  aad: Uint8Array;
  createdAt: string;
}): Promise<ReceiptKeyEnvelope> {
  const ephemeral = (await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const recipientPublicKey = await importX25519PublicKey(params.recipient.encryptionPublicKey);
  const nonce = randomBytes(GCM_NONCE_BYTES);
  const wrappingKey = await deriveWrappingKey({
    privateKey: ephemeral.privateKey,
    publicKey: recipientPublicKey,
    salt: nonce,
    recipientKeyId: params.recipient.recipientKeyId,
  });
  const wrappedDek = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(nonce), additionalData: toArrayBuffer(params.aad), tagLength: 128 },
      wrappingKey,
      toArrayBuffer(params.dek),
    ),
  );

  return {
    recipientKeyId: params.recipient.recipientKeyId,
    recipientType: params.recipient.recipientType,
    wrappedDek: bytesToBase64Url(wrappedDek),
    algorithm: "x25519-hkdf-sha256-aes-256-gcm-v1",
    ephemeralPublicKey: await crypto.subtle.exportKey("jwk", ephemeral.publicKey),
    nonce: bytesToBase64Url(nonce),
    createdAt: params.createdAt,
  };
}

export async function encryptPrivateReceipt(params: {
  receiptId: string;
  operationId: string;
  tinCommitment: string;
  plaintext: Uint8Array;
  recipients: ReceiptEncryptionRecipient[];
  createdAt?: string;
}): Promise<EncryptedReceiptRecord> {
  if (params.recipients.length === 0) {
    throw new Error("A private receipt requires at least one owner-authorized key envelope");
  }
  const recipientIds = new Set(params.recipients.map((recipient) => recipient.recipientKeyId));
  if (recipientIds.size !== params.recipients.length) {
    throw new Error("Receipt key-envelope recipient IDs must be unique");
  }

  const createdAt = params.createdAt ?? new Date().toISOString();
  const aadModel = createPrivateReceiptAad(params);
  const aad = serializePrivateReceiptAad(aadModel);
  const aadCommitment = await sha256Hex(aad);
  const dek = randomBytes(AES_KEY_BYTES);
  const receiptNonce = randomBytes(GCM_NONCE_BYTES);
  const dekKey = await crypto.subtle.importKey("raw", toArrayBuffer(dek), { name: "AES-GCM" }, false, ["encrypt"]);

  try {
    const encrypted = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: toArrayBuffer(receiptNonce), additionalData: toArrayBuffer(aad), tagLength: 128 },
        dekKey,
        toArrayBuffer(params.plaintext),
      ),
    );
    const { ciphertext, authenticationTag } = splitCiphertextAndTag(encrypted);
    const keyEnvelopes = await Promise.all(
      params.recipients.map((recipient) => wrapDek({ dek, recipient, aad, createdAt })),
    );
    const integrityCommitment = await sha256Hex(
      canonicalFields([
        aadCommitment,
        bytesToBase64Url(receiptNonce),
        bytesToBase64Url(ciphertext),
        bytesToBase64Url(authenticationTag),
      ]),
    );

    return {
      receiptId: params.receiptId,
      operationId: params.operationId,
      tinCommitment: params.tinCommitment,
      protocolVersion: TSN_PRIVATE_RECEIPT_PROTOCOL_VERSION,
      ciphertext: bytesToBase64Url(ciphertext),
      nonce: bytesToBase64Url(receiptNonce),
      authenticationTag: bytesToBase64Url(authenticationTag),
      encryptionVersion: TSN_PRIVATE_RECEIPT_ENCRYPTION_VERSION,
      aadCommitment,
      integrityCommitment,
      keyEnvelopes,
      createdAt,
    };
  } finally {
    dek.fill(0);
  }
}

async function unwrapReceiptDek(params: {
  record: EncryptedReceiptRecord;
  recipientKeyId: string;
  recipientPrivateKey: CryptoKey;
}): Promise<{ dek: Uint8Array; aad: Uint8Array }> {
  const envelope = params.record.keyEnvelopes.find(
    (candidate) => candidate.recipientKeyId === params.recipientKeyId && !candidate.revokedAt,
  );
  if (!envelope) throw new Error("No active receipt key envelope exists for this authorized key");

  const aad = serializePrivateReceiptAad(createPrivateReceiptAad(params.record));
  if (await sha256Hex(aad) !== params.record.aadCommitment) {
    throw new Error("Private receipt authenticated context does not match its commitment");
  }
  const nonce = base64UrlToBytes(envelope.nonce);
  const ephemeralPublicKey = await importX25519PublicKey(envelope.ephemeralPublicKey);
  const wrappingKey = await deriveWrappingKey({
    privateKey: params.recipientPrivateKey,
    publicKey: ephemeralPublicKey,
    salt: nonce,
    recipientKeyId: params.recipientKeyId,
  });
  const dek = new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce), additionalData: toArrayBuffer(aad), tagLength: 128 },
    wrappingKey,
    toArrayBuffer(base64UrlToBytes(envelope.wrappedDek)),
  ));
  return { dek, aad };
}

async function verifyEncryptedReceiptIntegrity(record: EncryptedReceiptRecord): Promise<void> {
  const expectedIntegrity = await sha256Hex(
    canonicalFields([record.aadCommitment, record.nonce, record.ciphertext, record.authenticationTag]),
  );
  if (expectedIntegrity !== record.integrityCommitment) {
    throw new Error("Private receipt integrity commitment does not match its encrypted payload");
  }
}

export async function rewrapPrivateReceiptDek(params: {
  record: EncryptedReceiptRecord;
  approvingRecipientKeyId: string;
  approvingRecipientPrivateKey: CryptoKey;
  newRecipient: ReceiptEncryptionRecipient;
  createdAt?: string;
}): Promise<ReceiptKeyEnvelope> {
  if (params.record.keyEnvelopes.some((envelope) =>
    envelope.recipientKeyId === params.newRecipient.recipientKeyId && !envelope.revokedAt
  )) {
    throw new Error("An active key envelope already exists for the recovery recipient");
  }
  const { dek, aad } = await unwrapReceiptDek({
    record: params.record,
    recipientKeyId: params.approvingRecipientKeyId,
    recipientPrivateKey: params.approvingRecipientPrivateKey,
  });
  try {
    await verifyEncryptedReceiptIntegrity(params.record);
    return await wrapDek({
      dek,
      recipient: params.newRecipient,
      aad,
      createdAt: params.createdAt ?? new Date().toISOString(),
    });
  } finally {
    dek.fill(0);
  }
}

export async function decryptPrivateReceiptForAuthorizedKey(params: {
  record: EncryptedReceiptRecord;
  recipientKeyId: string;
  recipientPrivateKey: CryptoKey;
}): Promise<Uint8Array> {
  const { dek, aad } = await unwrapReceiptDek(params);
  try {
    await verifyEncryptedReceiptIntegrity(params.record);
    const ciphertext = base64UrlToBytes(params.record.ciphertext);
    const authenticationTag = base64UrlToBytes(params.record.authenticationTag);
    const dekKey = await crypto.subtle.importKey("raw", toArrayBuffer(dek), { name: "AES-GCM" }, false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(base64UrlToBytes(params.record.nonce)),
        additionalData: toArrayBuffer(aad),
        tagLength: 128,
      },
      dekKey,
      toArrayBuffer(combineCiphertextAndTag(ciphertext, authenticationTag)),
    );
    return new Uint8Array(plaintext);
  } finally {
    dek.fill(0);
  }
}
