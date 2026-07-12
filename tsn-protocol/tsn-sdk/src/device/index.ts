/**
 * TSN Device Identity System
 * 
 * Provides device registration, authorization, and key management
 * for TSN private view access.
 * 
 * Device keys are:
 * - Generated on the user's device
 * - Never uploaded to backend
 * - Never stored in JSON or localStorage
 * - Protected by platform secure credential systems (Secure Enclave, Android Keystore, WebAuthn)
 */

import nacl from "tweetnacl";
import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";

// Constants
const DEVICE_ID_LENGTH = 16;
const PROTOCOL_VERSION = "1.0";
const DEVICE_DOMAIN = "tsn_device_identity_v1";

/**
 * Device identity stored in TSN Device Registry
 */
export interface DeviceIdentity {
  deviceId: string;
  deviceSigningPublicKey: string; // Base58 encoded
  deviceEncryptionPublicKey: string; // Base58 encoded
  tin: string;
  ownerPublicKey: string; // Base58 encoded - wallet that authorized this device
  status: DeviceStatus;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Device status in registry
 */
export type DeviceStatus = "active" | "suspended" | "revoked";

/**
 * Device key pair generated on-device
 */
export interface DeviceKeyPair {
  signing: nacl.SignKeyPair;
  encryption: nacl.BoxKeyPair;
}

/**
 * Device authorization proof signed by wallet owner
 */
export interface DeviceAuthorizationProof {
  deviceId: string;
  deviceSigningPublicKey: string;
  deviceEncryptionPublicKey: string;
  ownerPublicKey: string;
  permissions: DevicePermissions;
  nonce: string;
  issuedAt: number; // Unix timestamp
  expiresAt: number; // Unix timestamp
  signature: string; // Base64 encoded
}

/**
 * Permissions granted to device
 */
export interface DevicePermissions {
  viewSettlementDetails: boolean;
  viewTransactionHistory: boolean;
  viewBalance: boolean;
  decryptReceipts: boolean;
}

/**
 * Device signature proof for session requests
 */
export interface DeviceSignatureProof {
  deviceId: string;
  deviceSigningPublicKey: string;
  purpose: SignaturePurpose;
  nonce: string;
  timestamp: number;
  signature: string; // Base64 encoded
}

/**
 * Purpose of device signature
 */
export type SignaturePurpose = 
  | "device_registration"
  | "session_creation"
  | "session_refresh"
  | "session_revocation"
  | "device_revocation"
  | "receipt_access";

/**
 * Generate a unique device ID
 */
export function generateDeviceId(): string {
  const bytes = nacl.randomBytes(DEVICE_ID_LENGTH);
  return Buffer.from(bytes).toString("hex");
}

/**
 * Generate device key pairs on-device
 * 
 * IMPORTANT: These keys must be stored in platform secure storage:
 * - Mobile: Secure Enclave (iOS) or Android Keystore
 * - Web: WebAuthn/Passkeys credential storage
 */
export function generateDeviceKeys(): DeviceKeyPair {
  return {
    signing: nacl.sign.keyPair(),
    encryption: nacl.box.keyPair(),
  };
}

/**
 * Build canonical message for device authorization
 * 
 * The message includes:
 * - Protocol version
 * - Domain separator
 * - Device public keys
 * - Owner wallet
 * - TIN
 * - Permissions
 * - Nonce
 * - Timestamp
 * - Expiration
 */
export function buildDeviceAuthorizationMessage(params: {
  deviceId: string;
  deviceSigningPublicKey: string;
  deviceEncryptionPublicKey: string;
  ownerPublicKey: string;
  tin: string;
  permissions: DevicePermissions;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}): Uint8Array {
  const messageParts = [
    DEVICE_DOMAIN,
    PROTOCOL_VERSION,
    params.deviceId,
    params.deviceSigningPublicKey,
    params.deviceEncryptionPublicKey,
    params.ownerPublicKey,
    params.tin,
    JSON.stringify(params.permissions),
    params.nonce,
    params.issuedAt.toString(),
    params.expiresAt.toString(),
  ];
  return utf8ToBytes(messageParts.join("|"));
}

/**
 * Build canonical message for device signature proof
 */
export function buildDeviceSignatureMessage(params: {
  deviceId: string;
  deviceSigningPublicKey: string;
  purpose: SignaturePurpose;
  nonce: string;
  timestamp: number;
}): Uint8Array {
  const messageParts = [
    DEVICE_DOMAIN,
    "signature",
    PROTOCOL_VERSION,
    params.deviceId,
    params.deviceSigningPublicKey,
    params.purpose,
    params.nonce,
    params.timestamp.toString(),
  ];
  return utf8ToBytes(messageParts.join("|"));
}

/**
 * Generate nonce for replay protection
 */
export function generateNonce(): string {
  const bytes = nacl.randomBytes(32);
  return Buffer.from(bytes).toString("base64");
}

/**
 * Validate device authorization proof
 */
export function validateDeviceAuthorization(params: {
  proof: DeviceAuthorizationProof;
  expectedOwnerPublicKey: string;
  expectedTin: string;
  currentTime: number;
}): { valid: boolean; error?: string } {
  // Check expiration
  if (params.currentTime > params.proof.expiresAt) {
    return { valid: false, error: "Device authorization has expired" };
  }

  // Check issued time is not in future
  if (params.currentTime < params.proof.issuedAt) {
    return { valid: false, error: "Device authorization issued time is in the future" };
  }

  // Check owner matches
  if (params.proof.ownerPublicKey !== params.expectedOwnerPublicKey) {
    return { valid: false, error: "Owner public key mismatch" };
  }

  // Check TIN matches
  if (params.proof.tin !== params.expectedTin) {
    return { valid: false, error: "TIN mismatch" };
  }

  // Verify signature
  const message = buildDeviceAuthorizationMessage({
    deviceId: params.proof.deviceId,
    deviceSigningPublicKey: params.proof.deviceSigningPublicKey,
    deviceEncryptionPublicKey: params.proof.deviceEncryptionPublicKey,
    ownerPublicKey: params.proof.ownerPublicKey,
    tin: params.proof.tin,
    permissions: params.proof.permissions,
    nonce: params.proof.nonce,
    issuedAt: params.proof.issuedAt,
    expiresAt: params.proof.expiresAt,
  });

  const signatureBytes = Buffer.from(params.proof.signature, "base64");
  const publicKeyBytes = Buffer.from(params.proof.ownerPublicKey, "base58");

  const isValid = nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes);
  if (!isValid) {
    return { valid: false, error: "Invalid authorization signature" };
  }

  return { valid: true };
}

/**
 * Validate device signature proof
 */
export function validateDeviceSignature(params: {
  proof: DeviceSignatureProof;
  expectedDeviceSigningPublicKey: string;
  expectedPurpose: SignaturePurpose;
  nonce: string;
  currentTime: number;
  nonceValidator?: (nonce: string) => boolean;
}): { valid: boolean; error?: string } {
  // Check timestamp is recent (within 5 minutes)
  const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;
  if (Math.abs(params.currentTime - params.proof.timestamp) > MAX_TIMESTAMP_DRIFT_MS) {
    return { valid: false, error: "Device signature timestamp is too old or in the future" };
  }

  // Check purpose matches
  if (params.proof.purpose !== params.expectedPurpose) {
    return { valid: false, error: "Signature purpose mismatch" };
  }

  // Check nonce matches (if validator provided)
  if (params.nonceValidator && !params.nonceValidator(params.proof.nonce)) {
    return { valid: false, error: "Invalid nonce" };
  }

  // Verify signature using device's signing public key
  const message = buildDeviceSignatureMessage({
    deviceId: params.proof.deviceId,
    deviceSigningPublicKey: params.proof.deviceSigningPublicKey,
    purpose: params.proof.purpose,
    nonce: params.proof.nonce,
    timestamp: params.proof.timestamp,
  });

  const signatureBytes = Buffer.from(params.proof.signature, "base64");
  const publicKeyBytes = Buffer.from(params.proof.deviceSigningPublicKey, "base58");

  const isValid = nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes);
  if (!isValid) {
    return { valid: false, error: "Invalid device signature" };
  }

  return { valid: true };
}

/**
 * Compute device identity hash for lookups
 */
export function computeDeviceIdentityHash(
  ownerPublicKey: string,
  deviceId: string
): string {
  const message = utf8ToBytes(`${DEVICE_DOMAIN}|${ownerPublicKey}|${deviceId}`);
  return Buffer.from(sha256(message)).toString("hex");
}

/**
 * Default permissions for a new device
 */
export const DEFAULT_DEVICE_PERMISSIONS: DevicePermissions = {
  viewSettlementDetails: true,
  viewTransactionHistory: true,
  viewBalance: true,
  decryptReceipts: true,
};

/**
 * Device authorization expiration time (24 hours)
 */
export const DEVICE_AUTH_EXPIRATION_MS = 24 * 60 * 60 * 1000;

/**
 * Create a new device authorization proof
 */
export function createDeviceAuthorization(params: {
  deviceId: string;
  deviceSigningPublicKey: string;
  deviceEncryptionPublicKey: string;
  ownerPublicKey: string;
  ownerSigningKeyPair: nacl.SignKeyPair;
  tin: string;
  permissions?: Partial<DevicePermissions>;
  nonce: string;
  issuedAt: number;
}): DeviceAuthorizationProof {
  const permissions: DevicePermissions = {
    ...DEFAULT_DEVICE_PERMISSIONS,
    ...params.permissions,
  };

  const expiresAt = params.issuedAt + DEVICE_AUTH_EXPIRATION_MS;

  const message = buildDeviceAuthorizationMessage({
    deviceId: params.deviceId,
    deviceSigningPublicKey: params.deviceSigningPublicKey,
    deviceEncryptionPublicKey: params.deviceEncryptionPublicKey,
    ownerPublicKey: params.ownerPublicKey,
    tin: params.tin,
    permissions,
    nonce: params.nonce,
    issuedAt: params.issuedAt,
    expiresAt,
  });

  const signature = nacl.sign.detached(message, params.ownerSigningKeyPair.secretKey);

  return {
    deviceId: params.deviceId,
    deviceSigningPublicKey: params.deviceSigningPublicKey,
    deviceEncryptionPublicKey: params.deviceEncryptionPublicKey,
    ownerPublicKey: params.ownerPublicKey,
    permissions,
    nonce: params.nonce,
    issuedAt: params.issuedAt,
    expiresAt,
    signature: Buffer.from(signature).toString("base64"),
  };
}

/**
 * Create a device signature proof
 */
export function createDeviceSignature(params: {
  deviceId: string;
  deviceSigningKeyPair: nacl.SignKeyPair;
  purpose: SignaturePurpose;
  nonce: string;
  timestamp: number;
}): DeviceSignatureProof {
  const message = buildDeviceSignatureMessage({
    deviceId: params.deviceId,
    deviceSigningPublicKey: Buffer.from(params.deviceSigningKeyPair.publicKey).toString("base58"),
    purpose: params.purpose,
    nonce: params.nonce,
    timestamp: params.timestamp,
  });

  const signature = nacl.sign.detached(message, params.deviceSigningKeyPair.secretKey);

  return {
    deviceId: params.deviceId,
    deviceSigningPublicKey: Buffer.from(params.deviceSigningKeyPair.publicKey).toString("base58"),
    purpose: params.purpose,
    nonce: params.nonce,
    timestamp: params.timestamp,
    signature: Buffer.from(signature).toString("base64"),
  };
}

// Re-export types
export type {
  DeviceIdentity,
  DeviceStatus,
  DeviceKeyPair,
  DeviceAuthorizationProof,
  DevicePermissions,
  DeviceSignatureProof,
  SignaturePurpose,
} from "./index.js";
