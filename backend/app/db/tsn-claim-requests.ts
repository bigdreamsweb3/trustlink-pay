import { sql } from "@/app/db/client";
import type { ClaimRequestRecord, ClaimRequestStatus } from "@/app/types/tsn";

export async function findLatestActiveClaimRequestByPaymentId(paymentId: string): Promise<ClaimRequestRecord | null> {
  const rows = (await sql`
    SELECT
      id, payment_id, intent_id, recipient_hash, destination_wallet, autoclaim,
      status, requested_at, updated_at
    FROM claim_requests
    WHERE payment_id = ${paymentId}
      AND status IN ('pending', 'processing', 'completed')
    ORDER BY requested_at DESC
    LIMIT 1
  `) as ClaimRequestRecord[];

  return rows[0] ?? null;
}

export async function listLatestClaimRequestsByPaymentIds(paymentIds: string[]): Promise<ClaimRequestRecord[]> {
  if (paymentIds.length === 0) {
    return [];
  }

  const rows = (await sql`
    SELECT DISTINCT ON (payment_id)
      id, payment_id, intent_id, recipient_hash, destination_wallet, autoclaim,
      status, requested_at, updated_at
    FROM claim_requests
    WHERE payment_id = ANY(${paymentIds}::uuid[])
    ORDER BY payment_id, requested_at DESC
  `) as ClaimRequestRecord[];

  return rows;
}

export async function createClaimRequest(params: {
  paymentId: string;
  intentId: string;
  recipientHash: string;
  destinationWallet?: string | null;
  autoclaim: boolean;
}): Promise<ClaimRequestRecord> {
  const rows = (await sql`
    INSERT INTO claim_requests (
      payment_id, intent_id, recipient_hash, destination_wallet, autoclaim, status
    )
    VALUES (
      ${params.paymentId}, ${params.intentId}, ${params.recipientHash},
      ${params.destinationWallet ?? null}, ${params.autoclaim}, 'pending'
    )
    RETURNING
      id, payment_id, intent_id, recipient_hash, destination_wallet, autoclaim,
      status, requested_at, updated_at
  `) as ClaimRequestRecord[];

  return rows[0];
}

export async function updateClaimRequestStatus(params: {
  id: string;
  status: ClaimRequestStatus;
}): Promise<ClaimRequestRecord | null> {
  const rows = (await sql`
    UPDATE claim_requests
    SET status = ${params.status},
        updated_at = NOW()
    WHERE id = ${params.id}
    RETURNING
      id, payment_id, intent_id, recipient_hash, destination_wallet, autoclaim,
      status, requested_at, updated_at
  `) as ClaimRequestRecord[];

  return rows[0] ?? null;
}
