/**
 * TSN Private View Encryption Module
 * 
 * Implements ECDH key exchange, HKDF-SHA256 key derivation, and AES-256-GCM encryption
 * for private settlement receipts.
 * 
 * Cryptographic workflow:
 * 1. ECDH: Derive shared secret from sender's private key and recipient's public key
 * 2. HKDF-SHA256: Derive encryption key from shared secret + context
 * 3. AES-256-GCM: Encrypt plaintext with derived key
 */

import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";
import nacl from "tweetnacl";

// Constants
const KEY_LENGTH = 32; // 256 bits for AES-256
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const PROTOCOL_VERSION = "1.0";

/**
 * Domain separator for encryption context binding
 */
export const ENCRYPTION_DOMAIN = {
  RECEIPT: "tsn_receipt_v1",
  DEVICE_KEY: "tsn_device_key_v1",
  SESSION: "tsn_session_v1",
} as const;

/**
 * Encryption context binding parameters
 */
export interface EncryptionContext {
  receiptId: string;
  tinHash: string;
  deviceId: string;
  protocolVersion: string;
}

/**
 * Result of encrypting plaintext
 */
export interface EncryptedPayload {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  ephemeralPublicKey: Uint8Array;
  authTag: Uint8Array;
  context: EncryptionContext;
}

/**
 * Metadata stored alongside encrypted data (not encrypted)
 */
export interface EncryptionMetadata {
  algorithm: "x25519-ecdh-hkdf-sha256-aes256-gcm";
  protocolVersion: string;
  iv: string; // base64
  ephemeralPublicKey: string; // base64
  contextHash: string; // SHA-256 of context
  createdAt: string; // ISO timestamp
}

/**
 * Combined encrypted result for storage
 */
export interface EncryptedResult {
  ciphertext: string; // base64
  metadata: EncryptionMetadata;
}

/**
 * Generate a new keypair for ECDH
 */
export function generateEcdhKeyPair(): nacl.BoxKeyPair {
  return nacl.box.keyPair();
}

/**
 * Derive shared secret using ECDH (X25519)
 */
export function deriveSharedSecret(
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Uint8Array {
  if (privateKey.length !== 32 || peerPublicKey.length !== 32) {
    throw new Error("Invalid key length for X25519");
  }
  return nacl.box.before(peerPublicKey, privateKey);
}

/**
 * Build context string for HKDF derivation
 */
function buildContextString(context: EncryptionContext): Uint8Array {
  const parts = [
    ENCRYPTION_DOMAIN.RECEIPT,
    context.protocolVersion,
    context.receiptId,
    context.tinHash,
    context.deviceId,
  ];
  return new TextEncoder().encode(parts.join("|"));
}

/**
 * Derive encryption key using HKDF-SHA256
 */
export function deriveEncryptionKey(
  sharedSecret: Uint8Array,
  context: EncryptionContext,
  length: number = KEY_LENGTH
): Uint8Array {
  const info = buildContextString(context);
  return hkdf(sha256, sharedSecret, undefined, info, length);
}

/**
 * Generate random bytes for IV
 */
export function generateIv(): Uint8Array {
  return randomBytes(IV_LENGTH);
}

/**
 * Encrypt plaintext using AES-256-GCM
 * 
 * @param plaintext - Data to encrypt
 * @param key - 256-bit encryption key (derived from ECDH + HKDF)
 * @param iv - 96-bit initialization vector
 * @returns Ciphertext with authentication tag appended
 */
export async function encryptAes256Gcm(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array
): Promise<{ ciphertext: Uint8Array; authTag: Uint8Array }> {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH}, got ${key.length}`);
  }
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }

  // Use Web Crypto API for AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv), tagLength: AUTH_TAG_LENGTH * 8 },
    cryptoKey,
    plaintext.buffer as ArrayBuffer
  );

  const encryptedArray = new Uint8Array(encrypted);
  const ciphertext = encryptedArray.slice(0, -AUTH_TAG_LENGTH);
  const authTag = encryptedArray.slice(-AUTH_TAG_LENGTH);

  return { ciphertext, authTag };
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * 
 * @param ciphertext - Encrypted data (without auth tag)
 * @param authTag - Authentication tag
 * @param key - 256-bit decryption key
 * @param iv - 96-bit initialization vector
 * @returns Decrypted plaintext
 */
export async function decryptAes256Gcm(
  ciphertext: Uint8Array,
  authTag: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH}, got ${key.length}`);
  }
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // Append auth tag to ciphertext for decryption
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv), tagLength: AUTH_TAG_LENGTH * 8 },
    cryptoKey,
    combined.buffer as ArrayBuffer
  );

  return new Uint8Array(decrypted);
}

/**
 * Compute SHA-256 hash of context for binding
 */
export function hashContext(context: EncryptionContext): Uint8Array {
  const contextString = buildContextString(context);
  return sha256(contextString);
}

/**
 * Full encryption flow: ECDH + HKDF + AES-GCM
 * 
 * @param plaintext - Data to encrypt
 * @param senderPrivateKey - Sender's ephemeral private key
 * @param recipientPublicKey - Recipient's public key for ECDH
 * @param context - Encryption context for HKDF binding
 * @returns Encrypted payload with metadata
 */
export async function encryptWithEcdh(
  plaintext: Uint8Array,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  context: EncryptionContext
): Promise<EncryptedPayload> {
  // Step 1: ECDH - derive shared secret
  const sharedSecret = deriveSharedSecret(senderPrivateKey, recipientPublicKey);

  // Step 2: HKDF - derive encryption key
  const encryptionKey = deriveEncryptionKey(sharedSecret, context);

  // Step 3: Generate IV
  const iv = generateIv();

  // Step 4: AES-256-GCM encryption
  const { ciphertext, authTag } = await encryptAes256Gcm(plaintext, encryptionKey, iv);

  return {
    ciphertext,
    iv,
    ephemeralPublicKey: nacl.box.keyPair.fromSecretKey(senderPrivateKey).publicKey,
    authTag,
    context,
  };
}

/**
 * Full decryption flow: ECDH + HKDF + AES-GCM
 * 
 * @param payload - Encrypted payload
 * @param recipientPrivateKey - Recipient's private key
 * @returns Decrypted plaintext
 */
export async function decryptWithEcdh(
  payload: EncryptedPayload,
  recipientPrivateKey: Uint8Array
): Promise<Uint8Array> {
  // Step 1: ECDH - derive shared secret using ephemeral public key
  const sharedSecret = deriveSharedSecret(recipientPrivateKey, payload.ephemeralPublicKey);

  // Step 2: HKDF - derive decryption key
  const decryptionKey = deriveEncryptionKey(sharedSecret, payload.context);

  // Step 3: AES-256-GCM decryption
  return decryptAes256Gcm(
    payload.ciphertext,
    payload.authTag,
    decryptionKey,
    payload.iv
  );
}

/**
 * Serialize encrypted payload to storable format
 */
export function serializeEncryptedPayload(payload: EncryptedPayload): EncryptedResult {
  const contextHash = hashContext(payload.context);

  return {
    ciphertext: Buffer.from(payload.ciphertext).toString("base64"),
    metadata: {
      algorithm: "x25519-ecdh-hkdf-sha256-aes256-gcm",
      protocolVersion: PROTOCOL_VERSION,
      iv: Buffer.from(payload.iv).toString("base64"),
      ephemeralPublicKey: Buffer.from(payload.ephemeralPublicKey).toString("base64"),
      contextHash: Buffer.from(contextHash).toString("hex"),
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Deserialize stored encrypted data back to payload
 */
export function deserializeEncryptedPayload(
  ciphertext: string,
  metadata: EncryptionMetadata,
  context: EncryptionContext
): EncryptedPayload {
  return {
    ciphertext: Buffer.from(ciphertext, "base64"),
    iv: Buffer.from(metadata.iv, "base64"),
    ephemeralPublicKey: Buffer.from(metadata.ephemeralPublicKey, "base64"),
    authTag: new Uint8Array(0), // Auth tag is embedded in ciphertext for our format
    context,
  };
}

/**
 * Verify context hash matches
 */
export function verifyContextHash(
  context: EncryptionContext,
  expectedHash: string
): boolean {
  const computedHash = hashContext(context);
  return Buffer.from(computedHash).toString("hex") === expectedHash;
}
