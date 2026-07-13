/**
 * TSN V1 Privacy Types
 * 
 * These types represent the privacy-preserving architecture
 * where sensitive settlement information is encrypted and never
 * exposed in plaintext.
 */

/**
 * Private session stored in database
 */
export interface PrivateSessionRecord {
  id: string;
  user_id: string;
  tin: string;
  device_id: string;
  device_signing_public_key: string;
  permissions: SessionPermissions;
  status: SessionStatus;
  created_at: string;
  expires_at: string;
  last_accessed_at: string | null;
}

/**
 * Session status
 */
export type SessionStatus = "active" | "expired" | "revoked";

/**
 * Session permissions
 */
export interface SessionPermissions {
  viewSettlementDetails: boolean;
  viewTransactionHistory: boolean;
  viewBalance: boolean;
  decryptReceipts: boolean;
}

/**
 * Device registration in TSN registry
 */
export interface DeviceRegistryRecord {
  id: string;
  user_id: string;
  device_id: string;
  device_signing_public_key: string;
  device_encryption_public_key: string;
  status: DeviceStatus;
  permissions: SessionPermissions;
  created_at: string;
  last_used_at: string | null;
}

/**
 * Device status
 */
export type DeviceStatus = "active" | "suspended" | "revoked";

/**
 * Private receipt (encrypted storage)
 */
export interface PrivateReceiptRecord {
  id: string;
  payment_id: string;
  tin_hash: string;
  ciphertext: Buffer;
  encryption_metadata: EncryptionMetadata;
  created_at: string;
  expires_at: string;
}

/**
 * Encryption metadata (not sensitive)
 */
export interface EncryptionMetadata {
  algorithm: string;
  protocolVersion: string;
  iv: string;
  ephemeralPublicKey: string;
  contextHash: string;
  createdAt: string;
}

/**
 * Private receipt response for API
 * Contains only metadata, NOT the ciphertext
 */
export interface PrivateReceiptMetadataResponse {
  receiptId: string;
  paymentId: string;
  createdAt: string;
  expiresAt: string;
  status: "available" | "expired";
}

/**
 * TSN private view states returned to applications
 */
export type PrivateViewState = 
  | { status: "locked" }
  | { status: "authorized"; sessionId: string }
  | { status: "available" }
  | { status: "expired" }
  | { status: "error"; error: string };

/**
 * Privacy-preserving payment view
 * 
 * This is the safe version of PaymentRecord that should be returned
 * from backend APIs. It should NEVER contain:
 * - Transaction signatures
 * - Wallet addresses
 * - Settlement routes
 * - PRU addresses
 */
export interface PrivacyPreservingPaymentView {
  id: string;
  amount: string;
  tokenSymbol: string;
  status: PaymentPrivacyStatus;
  role: "sender" | "receiver";
  counterpartyDisplayName: string | null;
  counterpartyTin: string | null;
  referenceCode: string;
  createdAt: string;
  settledAt: string | null;
  notificationStatus: PaymentNotificationStatus;
  receiptId: string | null; // Only reference, not the receipt itself
}

/**
 * Payment status for privacy view
 */
export type PaymentPrivacyStatus = 
  | "pending" 
  | "settling" 
  | "settled" 
  | "failed" 
  | "refunded";

/**
 * Payment notification status
 */
export type PaymentNotificationStatus = "queued" | "sent" | "delivered" | "read" | "failed";

/**
 * Session creation request from client
 */
export interface CreateSessionRequest {
  tin: string;
  deviceId: string;
  deviceSigningPublicKey: string;
  deviceSignature: {
    nonce: string;
    timestamp: number;
    signature: string;
  };
  ownerPublicKey: string;
}

/**
 * Session creation response
 */
export interface CreateSessionResponse {
  sessionId: string;
  expiresAt: string;
  permissions: SessionPermissions;
}

/**
 * Device registration request
 */
export interface RegisterDeviceRequest {
  tin: string;
  deviceId: string;
  deviceSigningPublicKey: string;
  deviceEncryptionPublicKey: string;
  ownerSignature: string;
  ownerNonce: string;
  ownerTimestamp: number;
}

/**
 * Device registration response
 */
export interface RegisterDeviceResponse {
  deviceId: string;
  status: DeviceStatus;
  permissions: SessionPermissions;
}

/**
 * Open private view request
 */
export interface OpenPrivateViewRequest {
  receiptId: string;
  sessionId: string;
}

/**
 * Open private view response
 * 
 * CRITICAL: This returns the state only, not the decrypted receipt.
 * The actual decryption happens on the client device.
 */
export interface OpenPrivateViewResponse {
  state: PrivateViewState;
}

/**
 * Default session permissions
 */
export const DEFAULT_SESSION_PERMISSIONS: SessionPermissions = {
  viewSettlementDetails: true,
  viewTransactionHistory: true,
  viewBalance: true,
  decryptReceipts: true,
};

/**
 * Session TTL options (in hours)
 */
export const SESSION_TTL = {
  DEFAULT: 2,
  EXTENDED: 8,
  SHORT: 0.25, // 15 minutes
} as const;
