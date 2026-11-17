import { createHash } from "node:crypto";

import type { DeviceRegistrationChallenge } from "@trustlink/tsn-sdk/authorization/server";

import { sql } from "@/app/db/client";

function nonceCommitment(nonce: string) {
  return createHash("sha256")
    .update("TSN_OWNER_AUTHORIZATION_NONCE_V1\0")
    .update(nonce)
    .digest("hex");
}

export async function storeDeviceRegistrationChallenge(
  challenge: DeviceRegistrationChallenge,
): Promise<void> {
  await sql`
    INSERT INTO tsn_owner_authorization_nonces_v1 (
      nonce_commitment, tin_commitment, network, audience,
      issued_at, expires_at, consumed_at
    ) VALUES (
      ${nonceCommitment(challenge.nonce)}, ${challenge.tinCommitment},
      ${challenge.network}, ${challenge.audience}, ${challenge.issuedAt},
      ${challenge.expiresAt}, NULL
    )
  `;
}

export async function consumeDeviceRegistrationChallenge(params: {
  nonce: string;
  tinCommitment: string;
  network: string;
  audience: string;
  issuedAt: string;
  expiresAt: string;
}): Promise<boolean> {
  const rows = await sql`
    UPDATE tsn_owner_authorization_nonces_v1
    SET consumed_at = NOW()
    WHERE nonce_commitment = ${nonceCommitment(params.nonce)}
      AND tin_commitment = ${params.tinCommitment}
      AND network = ${params.network}
      AND audience = ${params.audience}
      AND issued_at = ${params.issuedAt}
      AND expires_at = ${params.expiresAt}
      AND expires_at > NOW()
      AND consumed_at IS NULL
    RETURNING nonce_commitment
  `;
  return rows.length === 1;
}
