/**
 * TSN Private View Types
 * 
 * Type definitions for the frontend TSN Private View SDK integration.
 */

/**
 * Private view states returned to applications
 */
export type PrivateViewState = 
  | { status: "locked" }
  | { status: "authorized"; sessionId: string }
  | { status: "available"; receipt: PrivateReceipt }
  | { status: "expired" }
  | { status: "error"; error: string };

/**
 * Private receipt containing decrypted settlement details
 * 
 * CRITICAL: This object must NEVER be stored in application state.
 * It should only exist in memory during rendering.
 */
export interface PrivateReceipt {
  receiptId: string;
  paymentId: string;
  amount: string;
  tokenSymbol: string;
  tokenMintAddress: string;
  settlementStatus: SettlementStatus;
  settledAt: string | null;
  counterpartyDisplayName: string | null;
  counterpartyTin: string | null;
  transactionNote: string | null;
}

/**
 * Settlement status
 */
export type SettlementStatus = 
  | "pending" 
  | "settling" 
  | "settled" 
  | "failed" 
  | "refunded";

/**
 * Receipt metadata (non-sensitive)
 */
export interface ReceiptMetadata {
  receiptId: string;
  paymentId: string;
  createdAt: string;
  expiresAt: string;
  status: "available" | "expired";
}

/**
 * Stored encrypted receipt from API
 */
export interface StoredEncryptedReceipt {
  receiptId: string;
  paymentId: string;
  tinHash: string;
  ciphertext: string;
  metadata: {
    algorithm: string;
    protocolVersion: string;
    iv: string;
    ephemeralPublicKey: string;
    contextHash: string;
    createdAt: string;
  };
}

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
 * Active private session
 */
export interface ActivePrivateSession {
  sessionId: string;
  userId: string;
  tin: string;
  deviceId: string;
  permissions: SessionPermissions;
  expiresAt: string;
  remainingTtlMs: number;
}

/**
 * Create session request
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
 * Create session response
 */
export interface CreateSessionResponse {
  sessionId: string;
  expiresAt: string;
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
 */
export interface OpenPrivateViewResponse {
  state: PrivateViewState;
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
 * Device status
 */
export type DeviceStatus = "active" | "suspended" | "revoked";

/**
 * Private view configuration
 */
export interface TSNPrivateViewConfig {
  tsnMempoolUrl: string;
  deviceEncryptionPublicKey: string;
  ownerPublicKey: string;
}

/**
 * Privacy-preserving payment summary
 * 
 * This is the safe version returned from backend APIs.
 * Contains no sensitive settlement data.
 */
export interface PrivacyPreservingPayment {
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
  receiptId: string | null;
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
export type PaymentNotificationStatus = 
  | "queued" 
  | "sent" 
  | "delivered" 
  | "read" 
  | "failed";

/**
 * Session TTL options (in hours)
 */
export const SESSION_TTL = {
  DEFAULT: 2,
  EXTENDED: 8,
  SHORT: 0.25,
} as const;
