/**
 * TSN Private View SDK
 * 
 * Provides private view access for settlement receipts.
 * 
 * This SDK owns:
 * - Authorization
 * - Decryption
 * - Rendering
 * - Cleanup
 * 
 * Applications only receive states:
 * - locked
 * - authorized
 * - available
 * - expired
 * 
 * CRITICAL: Applications must NEVER call decryptReceipt() directly
 * and must NEVER store private settlement objects in application state.
 */

import {
  encryptWithEcdh,
  decryptWithEcdh,
  deserializeEncryptedPayload,
  verifyContextHash,
  type EncryptionContext,
  type EncryptedResult,
} from "../encryption/index.js";

import {
  type DeviceAuthorizationProof,
  type DeviceSignatureProof,
  type DeviceKeyPair,
  validateDeviceAuthorization,
  validateDeviceSignature,
} from "../device/index.js";

import {
  type PrivateSession,
  type ActivePrivateSession,
  type SessionPermissions,
  type CreateSessionRequest,
  type CreateSessionResult,
  validateSession,
  createSession,
  activateSession,
  isSessionExpired,
  getRemainingTtlMs,
  hasPermission,
  computeSessionIdHash,
  computeSessionTokenHash,
  buildSessionCreationMessage,
  SESSION_TTL,
} from "../sessions/index.js";

// Constants
const PRIVATE_VIEW_DOMAIN = "tsn_private_view_v1";
const PROTOCOL_VERSION = "1.0";

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
 * It should only exist in memory during rendering and be cleared immediately after.
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
  // Note: Transaction signatures, wallet addresses, and PRU routes
  // are deliberately NOT included in this interface.
  // These details remain encrypted and are never exposed to applications.
}

/**
 * Settlement status
 */
export type SettlementStatus = "pending" | "settling" | "settled" | "failed" | "refunded";

/**
 * Receipt metadata (non-sensitive)
 */
export interface ReceiptMetadata {
  receiptId: string;
  paymentId: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Encrypted receipt from storage
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
 * Private view configuration
 */
export interface PrivateViewConfig {
  tsnMempoolUrl: string;
  deviceEncryptionPublicKey: string; // Base58 encoded
  ownerPublicKey: string; // Base58 encoded
}

/**
 * Open private view request
 */
export interface OpenPrivateViewRequest {
  receiptId: string;
  session: ActivePrivateSession;
  encryptedReceipt: StoredEncryptedReceipt;
}

/**
 * TSN Private View SDK
 */
export class TSNPrivateViewSDK {
  private config: PrivateViewConfig;
  private deviceKeyPair: DeviceKeyPair | null = null;

  constructor(config: PrivateViewConfig) {
    this.config = config;
  }

  /**
   * Set device keys (loaded from secure device storage)
   */
  setDeviceKeys(keyPair: DeviceKeyPair): void {
    this.deviceKeyPair = keyPair;
  }

  /**
   * Check if device keys are available
   */
  hasDeviceKeys(): boolean {
    return this.deviceKeyPair !== null;
  }

  /**
   * Get device encryption public key for receipts
   */
  getDeviceEncryptionPublicKey(): string {
    return this.config.deviceEncryptionPublicKey;
  }

  /**
   * Open private view for a receipt
   * 
   * Returns a state machine, NOT the raw decrypted receipt.
   * Applications receive only the state they need.
   */
  async openPrivateView(params: {
    receiptId: string;
    encryptedReceipt: StoredEncryptedReceipt;
    session: ActivePrivateSession;
  }): Promise<PrivateViewState> {
    // State 1: Check if session is valid
    const sessionValidation = validateSession({
      session: params.session,
      expectedUserId: params.session.userId,
      expectedTin: params.session.tin,
      expectedDeviceId: params.session.deviceId,
    });

    if (!sessionValidation.valid) {
      return { status: "expired" };
    }

    // State 2: Check permission
    if (!hasPermission(params.session, "decryptReceipts")) {
      return { status: "locked" };
    }

    // State 3: Verify device keys available
    if (!this.deviceKeyPair) {
      return { status: "locked" };
    }

    // State 4: Decrypt receipt
    try {
      const receipt = await this.decryptReceipt(
        params.encryptedReceipt,
        this.deviceKeyPair
      );

      // Verify TIN matches session
      if (receipt.counterpartyTin !== params.session.tin && 
          receipt.paymentId !== params.session.userId) {
        return { status: "error", error: "Receipt does not belong to session TIN" };
      }

      // State 5: Available
      return { status: "available", receipt };
    } catch (error) {
      return { 
        status: "error", 
        error: error instanceof Error ? error.message : "Decryption failed" 
      };
    }
  }

  /**
   * Internal decryption - never exposed to applications
   */
  private async decryptReceipt(
    encryptedReceipt: StoredEncryptedReceipt,
    deviceKeyPair: DeviceKeyPair
  ): Promise<PrivateReceipt> {
    // Build encryption context from session knowledge
    const context: EncryptionContext = {
      receiptId: encryptedReceipt.receiptId,
      tinHash: encryptedReceipt.tinHash,
      deviceId: this.deviceKeyPair ? 
        Buffer.from(this.deviceKeyPair.signing.publicKey).toString("base58") : "",
      protocolVersion: PROTOCOL_VERSION,
    };

    // Verify context hash
    if (!verifyContextHash(context, encryptedReceipt.metadata.contextHash)) {
      throw new Error("Receipt context verification failed");
    }

    // Deserialize payload
    const payload = deserializeEncryptedPayload(
      encryptedReceipt.ciphertext,
      encryptedReceipt.metadata as any,
      context
    );

    // Decrypt using device's encryption private key
    const devicePrivateKey = deviceKeyPair.encryption.secretKey;
    const plaintext = await decryptWithEcdh(payload, devicePrivateKey);

    // Parse JSON receipt
    const receiptData = JSON.parse(new TextDecoder().decode(plaintext));

    return receiptData as PrivateReceipt;
  }

  /**
   * Get receipt metadata (non-sensitive)
   * 
   * This can be called without full session validation
   * to show receipt existence without exposing details.
   */
  getReceiptMetadata(encryptedReceipt: StoredEncryptedReceipt): ReceiptMetadata {
    return {
      receiptId: encryptedReceipt.receiptId,
      paymentId: encryptedReceipt.paymentId,
      createdAt: encryptedReceipt.metadata.createdAt,
      expiresAt: new Date(
        new Date(encryptedReceipt.metadata.createdAt).getTime() + 
        SESSION_TTL.EXTENDED
      ).toISOString(),
    };
  }

  /**
   * Validate device authorization for private view access
   */
  validateDeviceAuthorization(params: {
    proof: DeviceAuthorizationProof;
    currentTime?: number;
  }): { valid: boolean; error?: string } {
    const currentTime = params.currentTime ?? Date.now();

    return validateDeviceAuthorization({
      proof: params.proof,
      expectedOwnerPublicKey: this.config.ownerPublicKey,
      expectedTin: params.proof.tin,
      currentTime,
    });
  }

  /**
   * Validate device signature for session access
   */
  validateDeviceSignature(params: {
    proof: DeviceSignatureProof;
    purpose: string;
    nonce: string;
    currentTime?: number;
  }): { valid: boolean; error?: string } {
    const currentTime = params.currentTime ?? Date.now();

    return validateDeviceSignature({
      proof: params.proof,
      expectedDeviceSigningPublicKey: Buffer.from(
        this.deviceKeyPair?.signing.publicKey ?? new Uint8Array(32)
      ).toString("base58"),
      expectedPurpose: params.purpose as any,
      nonce: params.nonce,
      currentTime,
    });
  }
}

/**
 * Build receipt for encryption
 * 
 * INTERNAL: Called by TSN Mempool only, never by applications.
 */
export function buildPrivateReceipt(params: {
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
}): PrivateReceipt {
  return {
    receiptId: params.receiptId,
    paymentId: params.paymentId,
    amount: params.amount,
    tokenSymbol: params.tokenSymbol,
    tokenMintAddress: params.tokenMintAddress,
    settlementStatus: params.settlementStatus,
    settledAt: params.settledAt,
    counterpartyDisplayName: params.counterpartyDisplayName,
    counterpartyTin: params.counterpartyTin,
    transactionNote: params.transactionNote,
  };
}

/**
 * Serialize receipt to JSON for encryption
 */
export function serializeReceipt(receipt: PrivateReceipt): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(receipt));
}

/**
 * Check if receipt is expired
 */
export function isReceiptExpired(metadata: ReceiptMetadata): boolean {
  return new Date(metadata.expiresAt).getTime() < Date.now();
}

/**
 * Get remaining TTL for receipt
 */
export function getReceiptRemainingTtl(metadata: ReceiptMetadata): number {
  return Math.max(0, new Date(metadata.expiresAt).getTime() - Date.now());
}

// Re-export types
export type {
  PrivateViewState,
  PrivateReceipt,
  SettlementStatus,
  ReceiptMetadata,
  StoredEncryptedReceipt,
  PrivateViewConfig,
  OpenPrivateViewRequest,
} from "./index.js";
