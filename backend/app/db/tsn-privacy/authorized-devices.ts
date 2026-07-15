import { sql } from "@/app/db/client";

export interface AuthorizedDeviceRecord {
  deviceId: string;
  tinCommitment: string;
  ownerIdentityCommitment: string;
  signingKeyFingerprint: string;
  signingPublicKey: JsonWebKey;
  encryptionKeyFingerprint: string;
  encryptionPublicKey: JsonWebKey;
  permissions: string[];
  historyRecoveryScope: "all" | "recent" | "selected" | "future-only";
  status: "active" | "revoked" | "expired";
  authorizedAt: string;
  expiresAt: string | null;
}

export async function registerAuthorizedDevice(params: AuthorizedDeviceRecord & {
  network: string;
  audience: string;
  authorizationCommitment: string;
}): Promise<void> {
  await sql`
    INSERT INTO tsn_authorized_devices_v1 (
      device_id, tin_commitment, owner_identity_commitment,
      signing_key_fingerprint, signing_public_key,
      encryption_key_fingerprint, encryption_public_key,
      permissions, authorized_network, authorized_audience,
      history_recovery_scope, owner_authorization_commitment,
      authorized_at, expires_at, status
    ) VALUES (
      ${params.deviceId}::uuid, ${params.tinCommitment}, ${params.ownerIdentityCommitment},
      ${params.signingKeyFingerprint}, ${JSON.stringify(params.signingPublicKey)}::jsonb,
      ${params.encryptionKeyFingerprint}, ${JSON.stringify(params.encryptionPublicKey)}::jsonb,
      ${JSON.stringify(params.permissions)}::jsonb, ${params.network}, ${params.audience},
      ${params.historyRecoveryScope}, ${params.authorizationCommitment},
      ${params.authorizedAt}, ${params.expiresAt}, ${params.status}
    )
  `;
}

export async function findAuthorizedDevice(deviceId: string): Promise<AuthorizedDeviceRecord | null> {
  const rows = await sql`
    SELECT device_id, tin_commitment, owner_identity_commitment,
      signing_key_fingerprint, signing_public_key,
      encryption_key_fingerprint, encryption_public_key,
      permissions, history_recovery_scope, status, authorized_at, expires_at
    FROM tsn_authorized_devices_v1
    WHERE device_id = ${deviceId}::uuid
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    deviceId: row.device_id,
    tinCommitment: row.tin_commitment,
    ownerIdentityCommitment: row.owner_identity_commitment,
    signingKeyFingerprint: row.signing_key_fingerprint,
    signingPublicKey: row.signing_public_key,
    encryptionKeyFingerprint: row.encryption_key_fingerprint,
    encryptionPublicKey: row.encryption_public_key,
    permissions: row.permissions,
    historyRecoveryScope: row.history_recovery_scope,
    status: row.status,
    authorizedAt: row.authorized_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null,
  };
}

export async function revokeAuthorizedDevice(params: {
  deviceId: string;
  tinCommitment: string;
}): Promise<boolean> {
  const rows = await sql`
    UPDATE tsn_authorized_devices_v1
    SET status = 'revoked', revoked_at = NOW()
    WHERE device_id = ${params.deviceId}::uuid
      AND tin_commitment = ${params.tinCommitment}
      AND status = 'active'
    RETURNING device_id
  `;
  if (rows.length === 0) return false;
  await sql`
    UPDATE tsn_private_sessions_v1
    SET status = 'revoked', revoked_at = NOW()
    WHERE device_id = ${params.deviceId}::uuid AND status = 'active'
  `;
  return true;
}
