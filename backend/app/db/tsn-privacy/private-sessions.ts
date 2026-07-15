import { createHash } from "node:crypto";

import { sql } from "@/app/db/client";

function hash(domain: string, value: string) {
  return createHash("sha256").update(domain).update("\0").update(value).digest("hex");
}

export interface PrivateSessionRecordV1 {
  sessionId: string;
  tinCommitment: string;
  deviceId: string;
  sessionTokenHash: string;
  permissions: string[];
  audience: string;
  expiresAt: string;
  status: "active" | "revoked" | "expired";
}

export async function createPrivateSessionRecord(params: {
  sessionId: string;
  tinCommitment: string;
  deviceId: string;
  sessionToken: string;
  permissions: string[];
  audience: string;
  origin?: string;
  issuedAt: string;
  expiresAt: string;
}): Promise<void> {
  await sql`
    INSERT INTO tsn_private_sessions_v1 (
      session_id, tin_commitment, device_id, session_token_hash,
      permissions, audience, origin, created_at, expires_at, status
    ) VALUES (
      ${params.sessionId}::uuid, ${params.tinCommitment}, ${params.deviceId}::uuid,
      ${hash("TSN_PRIVATE_SESSION_TOKEN_V1", params.sessionToken)},
      ${JSON.stringify(params.permissions)}::jsonb, ${params.audience}, ${params.origin ?? null},
      ${params.issuedAt}, ${params.expiresAt}, 'active'
    )
  `;
}

export async function findActivePrivateSessionByToken(token: string): Promise<PrivateSessionRecordV1 | null> {
  const rows = await sql`
    SELECT session_id, tin_commitment, device_id, session_token_hash,
      permissions, audience, expires_at, status
    FROM tsn_private_sessions_v1
    WHERE session_token_hash = ${hash("TSN_PRIVATE_SESSION_TOKEN_V1", token)}
      AND status = 'active' AND expires_at > NOW()
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return {
    sessionId: rows[0].session_id,
    tinCommitment: rows[0].tin_commitment,
    deviceId: rows[0].device_id,
    sessionTokenHash: rows[0].session_token_hash,
    permissions: rows[0].permissions,
    audience: rows[0].audience,
    expiresAt: rows[0].expires_at.toISOString(),
    status: rows[0].status,
  };
}

export async function consumePrivateRequestNonce(params: {
  nonce: string;
  deviceId: string;
  sessionId: string;
  purpose: string;
  expiresAt: string;
}): Promise<boolean> {
  const rows = await sql`
    INSERT INTO tsn_private_request_nonces_v1 (
      nonce_commitment, device_id, session_id, purpose, expires_at, consumed_at
    ) VALUES (
      ${hash("TSN_PRIVATE_REQUEST_NONCE_V1", params.nonce)},
      ${params.deviceId}::uuid, ${params.sessionId}::uuid,
      ${params.purpose}, ${params.expiresAt}, NOW()
    )
    ON CONFLICT (nonce_commitment) DO NOTHING
    RETURNING nonce_commitment
  `;
  return rows.length === 1;
}
