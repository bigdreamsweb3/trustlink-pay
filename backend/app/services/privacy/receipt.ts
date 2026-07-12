/**
 * Private Receipt Service
 * 
 * Handles encrypted storage and retrieval of private settlement receipts.
 * Receipts are encrypted client-side and only ciphertext is stored.
 */

import { sql } from "@/app/db/client";
import type { PrivateReceiptRecord, EncryptionMetadata, PrivateReceiptMetadataResponse } from "@/app/types/privacy";
import { logger } from "@/app/lib/logger";

/**
 * Database row type for private receipt queries
 */
interface ReceiptRow {
  id: string;
  payment_id: string;
  tin_hash: string;
  ciphertext: Buffer;
  encryption_metadata: EncryptionMetadata;
  created_at: Date;
  expires_at: Date;
}

/**
 * Metadata row type for receipt metadata queries
 */
interface ReceiptMetadataRow {
  id: string;
  payment_id: string;
  created_at: Date;
  expires_at: Date;
}

/**
 * Store an encrypted private receipt
 */
export async function storePrivateReceipt(params: {
  paymentId: string;
  tinHash: string;
  ciphertext: Buffer;
  encryptionMetadata: EncryptionMetadata;
  expiresAt: Date;
}): Promise<string> {
  const result = await sql`
    INSERT INTO private_receipts (
      id, payment_id, tin_hash, ciphertext, encryption_metadata, expires_at
    ) VALUES (
      gen_random_uuid(),
      ${params.paymentId},
      ${params.tinHash},
      ${params.ciphertext},
      ${JSON.stringify(params.encryptionMetadata)}::jsonb,
      ${params.expiresAt}
    )
    ON CONFLICT (payment_id) 
    DO UPDATE SET
      tin_hash = EXCLUDED.tin_hash,
      ciphertext = EXCLUDED.ciphertext,
      encryption_metadata = EXCLUDED.encryption_metadata,
      expires_at = EXCLUDED.expires_at
    RETURNING id
  `;
  
  logger.info("privacy.receipt.stored", {
    receiptId: result[0].id,
    paymentId: params.paymentId,
  });
  
  return result[0].id;
}

/**
 * Find receipt by ID
 */
export async function findReceiptById(
  receiptId: string
): Promise<PrivateReceiptRecord | null> {
  const result = await sql`
    SELECT 
      id, payment_id, tin_hash, ciphertext, encryption_metadata,
      created_at, expires_at
    FROM private_receipts
    WHERE id = ${receiptId}
    LIMIT 1
  `;
  
  if (result.length === 0) {
    return null;
  }
  
  const row = result[0];
  return {
    id: row.id,
    payment_id: row.payment_id,
    tin_hash: row.tin_hash,
    ciphertext: row.ciphertext,
    encryption_metadata: row.encryption_metadata as EncryptionMetadata,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
  };
}

/**
 * Find receipt by payment ID
 */
export async function findReceiptByPaymentId(
  paymentId: string
): Promise<PrivateReceiptRecord | null> {
  const result = await sql`
    SELECT 
      id, payment_id, tin_hash, ciphertext, encryption_metadata,
      created_at, expires_at
    FROM private_receipts
    WHERE payment_id = ${paymentId}
    LIMIT 1
  `;
  
  if (result.length === 0) {
    return null;
  }
  
  const row = result[0];
  return {
    id: row.id,
    payment_id: row.payment_id,
    tin_hash: row.tin_hash,
    ciphertext: row.ciphertext,
    encryption_metadata: row.encryption_metadata as EncryptionMetadata,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
  };
}

/**
 * Find receipt by TIN hash
 */
export async function findReceiptsByTinHash(
  tinHash: string,
  limit: number = 50
): Promise<PrivateReceiptRecord[]> {
  const result = await sql`
    SELECT 
      id, payment_id, tin_hash, ciphertext, encryption_metadata,
      created_at, expires_at
    FROM private_receipts
    WHERE tin_hash = ${tinHash}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  
  return result.map((row: ReceiptRow) => ({
    id: row.id,
    payment_id: row.payment_id,
    tin_hash: row.tin_hash,
    ciphertext: row.ciphertext,
    encryption_metadata: row.encryption_metadata as EncryptionMetadata,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
  }));
}

/**
 * Get receipt metadata (no ciphertext)
 */
export async function getReceiptMetadata(
  receiptId: string
): Promise<PrivateReceiptMetadataResponse | null> {
  const result = await sql`
    SELECT 
      id, payment_id, created_at, expires_at
    FROM private_receipts
    WHERE id = ${receiptId}
    LIMIT 1
  `;
  
  if (result.length === 0) {
    return null;
  }
  
  const row = result[0];
  const now = new Date();
  const expiresAt = row.expires_at;
  
  return {
    receiptId: row.id,
    paymentId: row.payment_id,
    createdAt: row.created_at.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: expiresAt > now ? "available" : "expired",
  };
}

/**
 * Delete expired receipts
 */
export async function deleteExpiredReceipts(): Promise<number> {
  const result = await sql`
    DELETE FROM private_receipts
    WHERE expires_at < NOW()
    RETURNING id
  `;
  
  if (result.length > 0) {
    logger.info("privacy.receipt.cleanup", { count: result.length });
  }
  
  return result.length;
}

/**
 * Delete receipt by payment ID
 */
export async function deleteReceiptByPaymentId(paymentId: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM private_receipts
    WHERE payment_id = ${paymentId}
    RETURNING id
  `;
  
  return result.length > 0;
}

/**
 * Count receipts by TIN hash
 */
export async function countReceiptsByTinHash(tinHash: string): Promise<number> {
  const result = await sql`
    SELECT COUNT(*) as count
    FROM private_receipts
    WHERE tin_hash = ${tinHash}
  `;
  
  return Number(result[0].count);
}

/**
 * Check if receipt exists for payment
 */
export async function hasReceiptForPayment(paymentId: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM private_receipts
    WHERE payment_id = ${paymentId}
    LIMIT 1
  `;
  
  return result.length > 0;
}

/**
 * Get receipts for a user (by TIN hash)
 * Returns only metadata, NOT ciphertext
 */
export async function getUserReceiptsMetadata(params: {
  tinHash: string;
  limit?: number;
  offset?: number;
}): Promise<PrivateReceiptMetadataResponse[]> {
  const result = await sql`
    SELECT 
      id, payment_id, created_at, expires_at
    FROM private_receipts
    WHERE tin_hash = ${params.tinHash}
    ORDER BY created_at DESC
    LIMIT ${params.limit ?? 50}
    OFFSET ${params.offset ?? 0}
  `;
  
  const now = new Date();
  
  return result.map((row: ReceiptMetadataRow) => ({
    receiptId: row.id,
    paymentId: row.payment_id,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    status: row.expires_at > now ? "available" : "expired",
  }));
}
