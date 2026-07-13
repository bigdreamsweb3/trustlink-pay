/**
 * TSN Private Session Manager
 * 
 * Manages private sessions for accessing TSN private view.
 * 
 * Session requirements:
 * - Wallet authorization
 * - Device signature
 * - TIN ownership verification
 * - Expiration
 * - Permissions
 * 
 * Sessions expire based on:
 * - Time (auto-expire)
 * - Logout
 * - Device revocation
 * - Security events
 */

import nacl from "tweetnacl";
import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";
import { randomBytes } from "@noble/hashes/utils";

// Base58 alphabet (Bitcoin style)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Decode base58 string to Uint8Array
 */
function base58Decode(str: string): Uint8Array {
  let result = new Uint8Array(0);
  for (let i = 0; i < str.length; i++) {
    let carry = BASE58_ALPHABET.indexOf(str[i]);
    if (carry === -1) throw new Error(`Invalid base58 character: ${str[i]}`);
    for (let j = 0; j < result.length; j++) {
      carry += 58 * result[j];
      result[j] = carry % 256;
      carry = Math.floor(carry / 256);
    }
    while (carry > 0) {
      result = new Uint8Array([carry % 256, ...result]);
      carry = Math.floor(carry / 256);
    }
  }
  for (let i = 0; i < str.length && str[i] === "1"; i++) {
    result = new Uint8Array([0, ...result]);
  }
  return result;
}

// Constants
const SESSION_DOMAIN = "tsn_private_session_v1";
const SESSION_TOKEN_LENGTH = 32;
const DEFAULT_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Private session state
 */
export type PrivateSessionState = 
  | { status: "locked" }
  | { status: "authorized"; session: PrivateSession }
  | { status: "active"; session: ActivePrivateSession }
  | { status: "expired" }
  | { status: "revoked" };

/**
 * Private session stored in database
 */
export interface PrivateSession {
  sessionId: string;
  userId: string;
  tin: string;
  deviceId: string;
  deviceSigningPublicKey: string;
  permissions: SessionPermissions;
  createdAt: string;
  expiresAt: string;
  lastAccessedAt: string | null;
  status: SessionStatus;
}

/**
 * Active session with runtime state
 */
export interface ActivePrivateSession extends PrivateSession {
  sessionToken: string;
  remainingTtlMs: number;
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
 * Request to create a new session
 */
export interface CreateSessionRequest {
  userId: string;
  tin: string;
  deviceId: string;
  deviceSigningPublicKey: string;
  deviceSignatureProof: {
    nonce: string;
    timestamp: number;
    signature: string;
  };
  ownerPublicKey: string;
  permissions?: Partial<SessionPermissions>;
}

/**
 * Session creation result
 */
export interface CreateSessionResult {
  sessionId: string;
  sessionToken: string;
  expiresAt: string;
  permissions: SessionPermissions;
}

/**
 * Session validation result
 */
export interface ValidateSessionResult {
  valid: boolean;
  session?: ActivePrivateSession;
  error?: string;
}

/**
 * Generate session token
 */
export function generateSessionToken(): string {
  const bytes = randomBytes(SESSION_TOKEN_LENGTH);
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Generate session ID
 */
export function generateSessionId(): string {
  const bytes = randomBytes(SESSION_TOKEN_LENGTH);
  return Buffer.from(bytes).toString("hex");
}

/**
 * Build canonical message for session creation
 */
export function buildSessionCreationMessage(params: {
  userId: string;
  tin: string;
  deviceId: string;
  deviceSigningPublicKey: string;
  ownerPublicKey: string;
  nonce: string;
  timestamp: number;
  expiresAt: number;
}): Uint8Array {
  const parts = [
    SESSION_DOMAIN,
    "create",
    params.userId,
    params.tin,
    params.deviceId,
    params.deviceSigningPublicKey,
    params.ownerPublicKey,
    params.nonce,
    params.timestamp.toString(),
    params.expiresAt.toString(),
  ];
  return utf8ToBytes(parts.join("|"));
}

/**
 * Compute session token hash for storage
 */
export function computeSessionTokenHash(token: string): string {
  const message = utf8ToBytes(`${SESSION_DOMAIN}|${token}`);
  return Buffer.from(sha256(message)).toString("hex");
}

/**
 * Compute session ID hash for lookups
 */
export function computeSessionIdHash(sessionId: string): string {
  const message = utf8ToBytes(`${SESSION_DOMAIN}|session|${sessionId}`);
  return Buffer.from(sha256(message)).toString("hex");
}

/**
 * Validate session creation request
 */
export function validateSessionCreationRequest(params: {
  request: CreateSessionRequest;
  expectedOwnerPublicKey: string;
  expectedTin: string;
  expectedDeviceSigningPublicKey: string;
  currentTime: number;
  nonceValidator?: (nonce: string) => boolean;
}): { valid: boolean; error?: string } {
  // Verify timestamp is recent (within 5 minutes)
  const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;
  if (Math.abs(params.currentTime - params.request.deviceSignatureProof.timestamp) > MAX_TIMESTAMP_DRIFT_MS) {
    return { valid: false, error: "Session request timestamp is too old or in the future" };
  }

  // Verify device public key matches
  if (params.request.deviceSigningPublicKey !== params.expectedDeviceSigningPublicKey) {
    return { valid: false, error: "Device signing public key mismatch" };
  }

  // Verify owner matches
  if (params.request.ownerPublicKey !== params.expectedOwnerPublicKey) {
    return { valid: false, error: "Owner public key mismatch" };
  }

  // Verify TIN matches
  if (params.request.tin !== params.expectedTin) {
    return { valid: false, error: "TIN mismatch" };
  }

  // Verify nonce
  if (params.nonceValidator && !params.nonceValidator(params.request.deviceSignatureProof.nonce)) {
    return { valid: false, error: "Invalid or reused nonce" };
  }

  // Verify device signature
  const message = buildSessionCreationMessage({
    userId: params.request.userId,
    tin: params.request.tin,
    deviceId: params.request.deviceId,
    deviceSigningPublicKey: params.request.deviceSigningPublicKey,
    ownerPublicKey: params.request.ownerPublicKey,
    nonce: params.request.deviceSignatureProof.nonce,
    timestamp: params.request.deviceSignatureProof.timestamp,
    expiresAt: params.currentTime + DEFAULT_SESSION_TTL_MS,
  });

  const signatureBytes = Buffer.from(params.request.deviceSignatureProof.signature, "base64");
  const devicePublicKeyBytes = base58Decode(params.request.deviceSigningPublicKey);

  const isValid = nacl.sign.detached.verify(message, signatureBytes, devicePublicKeyBytes);
  if (!isValid) {
    return { valid: false, error: "Invalid device signature" };
  }

  return { valid: true };
}

/**
 * Create a new session record
 */
export function createSession(params: {
  userId: string;
  tin: string;
  deviceId: string;
  deviceSigningPublicKey: string;
  permissions?: Partial<SessionPermissions>;
  ttlMs?: number;
}): PrivateSession {
  const now = Date.now();
  const ttl = params.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  
  const defaultPermissions: SessionPermissions = {
    viewSettlementDetails: true,
    viewTransactionHistory: true,
    viewBalance: true,
    decryptReceipts: true,
  };

  return {
    sessionId: generateSessionId(),
    userId: params.userId,
    tin: params.tin,
    deviceId: params.deviceId,
    deviceSigningPublicKey: params.deviceSigningPublicKey,
    permissions: { ...defaultPermissions, ...params.permissions },
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
    lastAccessedAt: null,
    status: "active",
  };
}

/**
 * Activate a session with token
 */
export function activateSession(session: PrivateSession): ActivePrivateSession {
  return {
    ...session,
    sessionToken: generateSessionToken(),
    remainingTtlMs: getRemainingTtlMs(session.expiresAt),
    status: "active",
  };
}

/**
 * Get remaining TTL for a session
 */
export function getRemainingTtlMs(expiresAt: string): number {
  const expiresAtMs = new Date(expiresAt).getTime();
  const now = Date.now();
  return Math.max(0, expiresAtMs - now);
}

/**
 * Check if a session is expired
 */
export function isSessionExpired(session: PrivateSession): boolean {
  return new Date(session.expiresAt).getTime() < Date.now();
}

/**
 * Validate an active session
 */
export function validateSession(params: {
  session: PrivateSession;
  expectedUserId: string;
  expectedTin: string;
  expectedDeviceId: string;
}): ValidateSessionResult {
  // Check if expired
  if (isSessionExpired(params.session)) {
    return { valid: false, error: "Session has expired" };
  }

  // Check status
  if (params.session.status === "revoked") {
    return { valid: false, error: "Session has been revoked" };
  }

  // Verify user ID
  if (params.session.userId !== params.expectedUserId) {
    return { valid: false, error: "User ID mismatch" };
  }

  // Verify TIN
  if (params.session.tin !== params.expectedTin) {
    return { valid: false, error: "TIN mismatch" };
  }

  // Verify device
  if (params.session.deviceId !== params.expectedDeviceId) {
    return { valid: false, error: "Device ID mismatch" };
  }

  const remainingTtlMs = getRemainingTtlMs(params.session.expiresAt);
  
  // Return as PrivateSession since ActivePrivateSession requires sessionToken
  // which is only available after activation
  return {
    valid: true,
    session: {
      ...params.session,
      remainingTtlMs,
    } as unknown as ActivePrivateSession,
  };
}

/**
 * Check if a permission is granted
 */
export function hasPermission(
  session: PrivateSession | ActivePrivateSession,
  permission: keyof SessionPermissions
): boolean {
  return session.permissions[permission] === true;
}

/**
 * Session expiration times
 */
export const SESSION_TTL = {
  DEFAULT: DEFAULT_SESSION_TTL_MS,
  EXTENDED: 8 * 60 * 60 * 1000, // 8 hours
  SHORT: 15 * 60 * 1000, // 15 minutes
} as const;

/**
 * Permission constants
 */
export const PERMISSION_SCOPES = {
  VIEW_SETTLEMENT_DETAILS: "viewSettlementDetails",
  VIEW_TRANSACTION_HISTORY: "viewTransactionHistory",
  VIEW_BALANCE: "viewBalance",
  DECRYPT_RECEIPTS: "decryptReceipts",
} as const;
