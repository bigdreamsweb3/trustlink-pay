/**
 * Private Session Service
 * 
 * Manages private sessions for TSN private view access.
 * Sessions are time-limited and require device authorization.
 */

import { sql } from "@/app/db/client";
import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";
import { randomBytes } from "@noble/hashes/utils";
import { DeviceStatus, DEFAULT_SESSION_PERMISSIONS, SESSION_TTL } from "@/app/types/privacy";
import type { PrivateSessionRecord, SessionPermissions, SessionStatus } from "@/app/types/privacy";
import { logger } from "@/app/lib/logger";

const SESSION_DOMAIN = "tsn_private_session_v1";
const SESSION_TOKEN_LENGTH = 32;
const NONCE_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate session token
 */
function generateSessionToken(): string {
  const bytes = randomBytes(SESSION_TOKEN_LENGTH);
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Generate session token hash
 */
export function computeSessionTokenHash(token: string): string {
  const message = utf8ToBytes(`${SESSION_DOMAIN}|${token}`);
  return Buffer.from(sha256(message)).toString("hex");
}

/**
 * Generate nonce hash
 */
export function computeNonceHash(nonce: string): string {
  const message = utf8ToBytes(`${SESSION_DOMAIN}|nonce|${nonce}`);
  return Buffer.from(sha256(message)).toString("hex");
}

/**
 * Find session by token hash
 */
export async function findSessionByToken(token: string): Promise<PrivateSessionRecord | null> {
  const tokenHash = computeSessionTokenHash(token);
  
  const result = await sql`
    SELECT 
      id, user_id, tin, device_id, device_signing_public_key,
      permissions, status, created_at, expires_at, last_accessed_at
    FROM private_sessions
    WHERE session_token_hash = ${tokenHash}
      AND status = 'active'
      AND expires_at > NOW()
    LIMIT 1
  `;
  
  if (result.length === 0) {
    return null;
  }
  
  const row = result[0];
  return {
    id: row.id,
    user_id: row.user_id,
    tin: row.tin,
    device_id: row.device_id,
    device_signing_public_key: row.device_signing_public_key,
    permissions: row.permissions as SessionPermissions,
    status: row.status as SessionStatus,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    last_accessed_at: row.last_accessed_at?.toISOString() ?? null,
  };
}

/**
 * Find session by ID
 */
export async function findSessionById(sessionId: string): Promise<PrivateSessionRecord | null> {
  const result = await sql`
    SELECT 
      id, user_id, tin, device_id, device_signing_public_key,
      permissions, status, created_at, expires_at, last_accessed_at
    FROM private_sessions
    WHERE id = ${sessionId}
    LIMIT 1
  `;
  
  if (result.length === 0) {
    return null;
  }
  
  const row = result[0];
  return {
    id: row.id,
    user_id: row.user_id,
    tin: row.tin,
    device_id: row.device_id,
    device_signing_public_key: row.device_signing_public_key,
    permissions: row.permissions as SessionPermissions,
    status: row.status as SessionStatus,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    last_accessed_at: row.last_accessed_at?.toISOString() ?? null,
  };
}

/**
 * Create a new private session
 */
export async function createSession(params: {
  userId: string;
  tin: string;
  deviceId: string;
  deviceSigningPublicKey: string;
  permissions?: Partial<SessionPermissions>;
  ttlHours?: number;
}): Promise<{ session: PrivateSessionRecord; token: string }> {
  const token = generateSessionToken();
  const tokenHash = computeSessionTokenHash(token);
  const ttl = params.ttlHours ?? SESSION_TTL.DEFAULT;
  
  const permissions = {
    ...DEFAULT_SESSION_PERMISSIONS,
    ...params.permissions,
  };
  
  const result = await sql`
    INSERT INTO private_sessions (
      id, user_id, tin, device_id, device_signing_public_key,
      session_token_hash, permissions, status, expires_at
    ) VALUES (
      gen_random_uuid(),
      ${params.userId},
      ${params.tin},
      ${params.deviceId},
      ${params.deviceSigningPublicKey},
      ${tokenHash},
      ${JSON.stringify(permissions)}::jsonb,
      'active',
      NOW() + INTERVAL '${sql.unsafe(`${ttl} hours`)}'
    )
    RETURNING 
      id, user_id, tin, device_id, device_signing_public_key,
      permissions, status, created_at, expires_at, last_accessed_at
  `;
  
  const row = result[0];
  
  logger.info("privacy.session.created", {
    sessionId: row.id,
    userId: params.userId,
    tin: params.tin,
    deviceId: params.deviceId,
  });
  
  return {
    session: {
      id: row.id,
      user_id: row.user_id,
      tin: row.tin,
      device_id: row.device_id,
      device_signing_public_key: row.device_signing_public_key,
      permissions: row.permissions as SessionPermissions,
      status: row.status as SessionStatus,
      created_at: row.created_at.toISOString(),
      expires_at: row.expires_at.toISOString(),
      last_accessed_at: row.last_accessed_at?.toISOString() ?? null,
    },
    token,
  };
}

/**
 * Validate and update session last accessed
 */
export async function touchSession(sessionId: string): Promise<void> {
  await sql`
    UPDATE private_sessions
    SET last_accessed_at = NOW()
    WHERE id = ${sessionId}
      AND status = 'active'
  `;
}

/**
 * Revoke a session
 */
export async function revokeSession(sessionId: string): Promise<boolean> {
  const result = await sql`
    UPDATE private_sessions
    SET status = 'revoked'
    WHERE id = ${sessionId}
      AND status = 'active'
    RETURNING id
  `;
  
  if (result.length > 0) {
    logger.info("privacy.session.revoked", { sessionId });
    return true;
  }
  
  return false;
}

/**
 * Revoke all sessions for a device
 */
export async function revokeDeviceSessions(params: {
  userId: string;
  deviceId: string;
}): Promise<number> {
  const result = await sql`
    UPDATE private_sessions
    SET status = 'revoked'
    WHERE user_id = ${params.userId}
      AND device_id = ${params.deviceId}
      AND status = 'active'
    RETURNING id
  `;
  
  logger.info("privacy.session.device_revoked", {
    userId: params.userId,
    deviceId: params.deviceId,
    count: result.length,
  });
  
  return result.length;
}

/**
 * Revoke all sessions for a user
 */
export async function revokeUserSessions(userId: string): Promise<number> {
  const result = await sql`
    UPDATE private_sessions
    SET status = 'revoked'
    WHERE user_id = ${userId}
      AND status = 'active'
    RETURNING id
  `;
  
  logger.info("privacy.session.user_revoked", {
    userId,
    count: result.length,
  });
  
  return result.length;
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await sql`
    UPDATE private_sessions
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at < NOW()
    RETURNING id
  `;
  
  if (result.length > 0) {
    logger.info("privacy.session.cleanup", { count: result.length });
  }
  
  return result.length;
}

/**
 * Validate nonce (one-time use)
 */
export async function validateAndConsumeNonce(params: {
  userId: string;
  deviceId: string;
  nonceHash: string;
  purpose: string;
}): Promise<boolean> {
  // Check if nonce exists
  const existing = await sql`
    SELECT id FROM session_nonces
    WHERE user_id = ${params.userId}
      AND device_id = ${params.deviceId}
      AND nonce_hash = ${params.nonceHash}
      AND purpose = ${params.purpose}
      AND expires_at > NOW()
    LIMIT 1
  `;
  
  if (existing.length === 0) {
    // Nonce doesn't exist or expired - this could be replay or just invalid
    return false;
  }
  
  // Delete the nonce (one-time use)
  await sql`
    DELETE FROM session_nonces
    WHERE user_id = ${params.userId}
      AND device_id = ${params.deviceId}
      AND nonce_hash = ${params.nonceHash}
      AND purpose = ${params.purpose}
  `;
  
  return true;
}

/**
 * Record a nonce for replay protection
 */
export async function recordNonce(params: {
  userId: string;
  deviceId: string;
  nonceHash: string;
  purpose: string;
  expiresInMs?: number;
}): Promise<boolean> {
  const expiresMs = params.expiresInMs ?? NONCE_VALIDITY_MS;
  
  try {
    await sql`
      INSERT INTO session_nonces (
        id, user_id, device_id, nonce_hash, purpose, expires_at
      ) VALUES (
        gen_random_uuid(),
        ${params.userId},
        ${params.deviceId},
        ${params.nonceHash},
        ${params.purpose},
        NOW() + INTERVAL '${sql.unsafe(`${Math.ceil(expiresMs / 1000)} seconds`)}'
      )
    `;
    return true;
  } catch {
    // Nonce already exists
    return false;
  }
}

/**
 * Clean up expired nonces
 */
export async function cleanupExpiredNonces(): Promise<number> {
  const result = await sql`
    DELETE FROM session_nonces
    WHERE expires_at < NOW()
    RETURNING id
  `;
  
  return result.length;
}

/**
 * Check if session has permission
 */
export function hasPermission(
  session: PrivateSessionRecord,
  permission: keyof SessionPermissions
): boolean {
  return session.permissions[permission] === true;
}

/**
 * Check if session is expired
 */
export function isSessionExpired(session: PrivateSessionRecord): boolean {
  return new Date(session.expires_at).getTime() < Date.now();
}

/**
 * Get remaining TTL in milliseconds
 */
export function getRemainingTtlMs(session: PrivateSessionRecord): number {
  return Math.max(0, new Date(session.expires_at).getTime() - Date.now());
}

/**
 * List active sessions for a user
 */
export async function listUserSessions(userId: string): Promise<PrivateSessionRecord[]> {
  const result = await sql`
    SELECT 
      id, user_id, tin, device_id, device_signing_public_key,
      permissions, status, created_at, expires_at, last_accessed_at
    FROM private_sessions
    WHERE user_id = ${userId}
      AND status = 'active'
      AND expires_at > NOW()
    ORDER BY created_at DESC
  `;
  
  return result.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    tin: row.tin,
    device_id: row.device_id,
    device_signing_public_key: row.device_signing_public_key,
    permissions: row.permissions as SessionPermissions,
    status: row.status as SessionStatus,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    last_accessed_at: row.last_accessed_at?.toISOString() ?? null,
  }));
}
