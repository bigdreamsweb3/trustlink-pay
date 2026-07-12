/**
 * Device Registry Service
 * 
 * Manages device registration, authorization, and revocation
 * for TSN private view access.
 */

import { sql } from "@/app/db/client";
import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";
import { DeviceStatus, DEFAULT_SESSION_PERMISSIONS } from "@/app/types/privacy";
import type { DeviceRegistryRecord, SessionPermissions } from "@/app/types/privacy";
import { logger } from "@/app/lib/logger";

const DEVICE_DOMAIN = "tsn_device_identity_v1";

/**
 * Compute device identity hash
 */
export function computeDeviceHash(ownerPublicKey: string, deviceId: string): string {
  const message = utf8ToBytes(`${DEVICE_DOMAIN}|${ownerPublicKey}|${deviceId}`);
  return Buffer.from(sha256(message)).toString("hex");
}

/**
 * Find device by signing public key
 */
export async function findDeviceBySigningKey(
  signingPublicKey: string
): Promise<DeviceRegistryRecord | null> {
  const result = await sql`
    SELECT 
      id, user_id, device_id, device_signing_public_key, 
      device_encryption_public_key, status, permissions, 
      created_at, last_used_at
    FROM device_registry
    WHERE device_signing_public_key = ${signingPublicKey}
      AND status = 'active'
    LIMIT 1
  `;
  
  if (result.length === 0) {
    return null;
  }
  
  const row = result[0];
  return {
    id: row.id,
    user_id: row.user_id,
    device_id: row.device_id,
    device_signing_public_key: row.device_signing_public_key,
    device_encryption_public_key: row.device_encryption_public_key,
    status: row.status as DeviceStatus,
    permissions: row.permissions as SessionPermissions,
    created_at: row.created_at.toISOString(),
    last_used_at: row.last_used_at?.toISOString() ?? null,
  };
}

/**
 * Find device by user ID and device ID
 */
export async function findDeviceByUserAndDevice(
  userId: string,
  deviceId: string
): Promise<DeviceRegistryRecord | null> {
  const result = await sql`
    SELECT 
      id, user_id, device_id, device_signing_public_key, 
      device_encryption_public_key, status, permissions, 
      created_at, last_used_at
    FROM device_registry
    WHERE user_id = ${userId}
      AND device_id = ${deviceId}
    LIMIT 1
  `;
  
  if (result.length === 0) {
    return null;
  }
  
  const row = result[0];
  return {
    id: row.id,
    user_id: row.user_id,
    device_id: row.device_id,
    device_signing_public_key: row.device_signing_public_key,
    device_encryption_public_key: row.device_encryption_public_key,
    status: row.status as DeviceStatus,
    permissions: row.permissions as SessionPermissions,
    created_at: row.created_at.toISOString(),
    last_used_at: row.last_used_at?.toISOString() ?? null,
  };
}

/**
 * Register a new device
 */
export async function registerDevice(params: {
  userId: string;
  deviceId: string;
  deviceSigningPublicKey: string;
  deviceEncryptionPublicKey: string;
  permissions?: Partial<SessionPermissions>;
}): Promise<DeviceRegistryRecord> {
  const permissions = {
    ...DEFAULT_SESSION_PERMISSIONS,
    ...params.permissions,
  };
  
  const result = await sql`
    INSERT INTO device_registry (
      id, user_id, device_id, device_signing_public_key, 
      device_encryption_public_key, status, permissions
    ) VALUES (
      gen_random_uuid(), 
      ${params.userId}, 
      ${params.deviceId}, 
      ${params.deviceSigningPublicKey}, 
      ${params.deviceEncryptionPublicKey}, 
      'active',
      ${JSON.stringify(permissions)}::jsonb
    )
    ON CONFLICT (user_id, device_id) 
    DO UPDATE SET
      device_signing_public_key = EXCLUDED.device_signing_public_key,
      device_encryption_public_key = EXCLUDED.device_encryption_public_key,
      status = 'active',
      permissions = EXCLUDED.permissions,
      last_used_at = NOW()
    RETURNING 
      id, user_id, device_id, device_signing_public_key, 
      device_encryption_public_key, status, permissions, 
      created_at, last_used_at
  `;
  
  const row = result[0];
  
  logger.info("privacy.device.registered", {
    deviceId: params.deviceId,
    userId: params.userId,
  });
  
  return {
    id: row.id,
    user_id: row.user_id,
    device_id: row.device_id,
    device_signing_public_key: row.device_signing_public_key,
    device_encryption_public_key: row.device_encryption_public_key,
    status: row.status as DeviceStatus,
    permissions: row.permissions as SessionPermissions,
    created_at: row.created_at.toISOString(),
    last_used_at: row.last_used_at?.toISOString() ?? null,
  };
}

/**
 * Revoke a device
 */
export async function revokeDevice(params: {
  userId: string;
  deviceId: string;
}): Promise<boolean> {
  const result = await sql`
    UPDATE device_registry
    SET status = 'revoked'
    WHERE user_id = ${params.userId}
      AND device_id = ${params.deviceId}
      AND status = 'active'
    RETURNING id
  `;
  
  if (result.length > 0) {
    // Also revoke all sessions for this device
    await sql`
      UPDATE private_sessions
      SET status = 'revoked'
      WHERE user_id = ${params.userId}
        AND device_id = ${params.deviceId}
        AND status = 'active'
    `;
    
    logger.info("privacy.device.revoked", {
      deviceId: params.deviceId,
      userId: params.userId,
    });
    
    return true;
  }
  
  return false;
}

/**
 * Suspend a device (temporary lock)
 */
export async function suspendDevice(params: {
  userId: string;
  deviceId: string;
}): Promise<boolean> {
  const result = await sql`
    UPDATE device_registry
    SET status = 'suspended'
    WHERE user_id = ${params.userId}
      AND device_id = ${params.deviceId}
      AND status = 'active'
    RETURNING id
  `;
  
  if (result.length > 0) {
    logger.info("privacy.device.suspended", {
      deviceId: params.deviceId,
      userId: params.userId,
    });
    return true;
  }
  
  return false;
}

/**
 * Update device last used timestamp
 */
export async function touchDevice(deviceId: string): Promise<void> {
  await sql`
    UPDATE device_registry
    SET last_used_at = NOW()
    WHERE device_id = ${deviceId}
  `;
}

/**
 * List devices for a user
 */
export async function listUserDevices(userId: string): Promise<DeviceRegistryRecord[]> {
  const result = await sql`
    SELECT 
      id, user_id, device_id, device_signing_public_key, 
      device_encryption_public_key, status, permissions, 
      created_at, last_used_at
    FROM device_registry
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  
  return result.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    device_id: row.device_id,
    device_signing_public_key: row.device_signing_public_key,
    device_encryption_public_key: row.device_encryption_public_key,
    status: row.status as DeviceStatus,
    permissions: row.permissions as SessionPermissions,
    created_at: row.created_at.toISOString(),
    last_used_at: row.last_used_at?.toISOString() ?? null,
  }));
}

/**
 * Validate device ownership
 */
export async function validateDeviceOwnership(params: {
  deviceId: string;
  userId: string;
}): Promise<boolean> {
  const result = await sql`
    SELECT id FROM device_registry
    WHERE device_id = ${params.deviceId}
      AND user_id = ${params.userId}
      AND status = 'active'
    LIMIT 1
  `;
  
  return result.length > 0;
}
