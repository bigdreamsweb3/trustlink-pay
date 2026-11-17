import { sql } from "@/app/db/client";
import type { EncryptedReceiptRecord } from "@trustlink/tsn-sdk";

export async function findEncryptedReceiptForRecipient(params: {
  receiptId: string;
  tinCommitment: string;
  recipientKeyId: string;
}): Promise<EncryptedReceiptRecord | null> {
  const rows = await sql`
    SELECT r.receipt_id, r.operation_id, r.tin_commitment, r.protocol_version,
      r.ciphertext, r.nonce, r.authentication_tag, r.encryption_version,
      r.aad_commitment, r.integrity_commitment, r.created_at,
      e.recipient_key_id, e.recipient_type, e.wrapped_dek,
      e.wrapping_algorithm, e.ephemeral_public_key, e.nonce AS envelope_nonce,
      e.created_at AS envelope_created_at, e.revoked_at
    FROM tsn_encrypted_receipts_v1 r
    JOIN tsn_receipt_key_envelopes_v1 e ON e.receipt_id = r.receipt_id
    WHERE r.receipt_id = ${params.receiptId}::uuid
      AND r.tin_commitment = ${params.tinCommitment}
      AND e.recipient_key_id = ${params.recipientKeyId}
      AND e.revoked_at IS NULL
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    receiptId: row.receipt_id,
    operationId: row.operation_id,
    tinCommitment: row.tin_commitment,
    protocolVersion: row.protocol_version,
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    authenticationTag: row.authentication_tag,
    encryptionVersion: row.encryption_version,
    aadCommitment: row.aad_commitment,
    integrityCommitment: row.integrity_commitment,
    createdAt: row.created_at.toISOString(),
    keyEnvelopes: [{
      recipientKeyId: row.recipient_key_id,
      recipientType: row.recipient_type,
      wrappedDek: row.wrapped_dek,
      algorithm: row.wrapping_algorithm,
      ephemeralPublicKey: row.ephemeral_public_key,
      nonce: row.envelope_nonce,
      createdAt: row.envelope_created_at.toISOString(),
      ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {}),
    }],
  };
}

export async function getPrivateHistoryAvailability(params: {
  tinCommitment: string;
  recipientKeyId: string;
}) {
  const rows = await sql`
    SELECT COUNT(*)::int AS total,
      COUNT(e.envelope_id)::int AS accessible
    FROM tsn_encrypted_receipts_v1 r
    LEFT JOIN tsn_receipt_key_envelopes_v1 e
      ON e.receipt_id = r.receipt_id
      AND e.recipient_key_id = ${params.recipientKeyId}
      AND e.revoked_at IS NULL
    WHERE r.tin_commitment = ${params.tinCommitment}
  `;
  return { total: Number(rows[0]?.total ?? 0), accessible: Number(rows[0]?.accessible ?? 0) };
}
