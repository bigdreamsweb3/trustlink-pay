import { sql } from "@/app/db/client";
import type { PaymentIntentRecord, PaymentIntentStatus } from "@/app/types/tsn";

export async function findPaymentIntentByPaymentId(paymentId: string): Promise<PaymentIntentRecord | null> {
  const rows = (await sql`
    SELECT
      id, payment_id, intent_seed_hash, recipient_hash, token_mint_address, amount,
      status, assigned_cranker_pubkey, lease_expiry_at, claim_tx_sig, proof_tx_sig, created_at
    FROM payment_intents
    WHERE payment_id = ${paymentId}
    LIMIT 1
  `) as PaymentIntentRecord[];

  return rows[0] ?? null;
}

export async function listPaymentIntentsByPaymentIds(paymentIds: string[]): Promise<PaymentIntentRecord[]> {
  if (paymentIds.length === 0) {
    return [];
  }

  const rows = (await sql`
    SELECT
      id, payment_id, intent_seed_hash, recipient_hash, token_mint_address, amount,
      status, assigned_cranker_pubkey, lease_expiry_at, claim_tx_sig, proof_tx_sig, created_at
    FROM payment_intents
    WHERE payment_id = ANY(${paymentIds}::uuid[])
  `) as PaymentIntentRecord[];

  return rows;
}

export async function upsertPaymentIntent(params: {
  id: string;
  paymentId: string;
  intentSeedHash: string;
  recipientHash: string;
  tokenMintAddress?: string | null;
  amount: number;
}): Promise<PaymentIntentRecord> {
  const rows = (await sql`
    INSERT INTO payment_intents (
      id, payment_id, intent_seed_hash, recipient_hash, token_mint_address, amount, status
    )
    VALUES (
      ${params.id}, ${params.paymentId}, ${params.intentSeedHash}, ${params.recipientHash},
      ${params.tokenMintAddress ?? null}, ${params.amount}, 'pending'
    )
    ON CONFLICT (id) DO UPDATE
      SET payment_id = EXCLUDED.payment_id,
          intent_seed_hash = EXCLUDED.intent_seed_hash,
          recipient_hash = EXCLUDED.recipient_hash,
          token_mint_address = EXCLUDED.token_mint_address,
          amount = EXCLUDED.amount
    RETURNING
      id, payment_id, intent_seed_hash, recipient_hash, token_mint_address, amount,
      status, assigned_cranker_pubkey, lease_expiry_at, claim_tx_sig, proof_tx_sig, created_at
  `) as PaymentIntentRecord[];

  return rows[0];
}

export async function updatePaymentIntentStatus(params: {
  id: string;
  status: PaymentIntentStatus;
  assignedCrankerPubkey?: string | null;
  leaseExpiryAt?: string | null;
  claimTxSig?: string | null;
  proofTxSig?: string | null;
}): Promise<PaymentIntentRecord | null> {
  const rows = (await sql`
    UPDATE payment_intents
    SET
      status = ${params.status},
      assigned_cranker_pubkey = COALESCE(${params.assignedCrankerPubkey ?? null}, assigned_cranker_pubkey),
      lease_expiry_at = COALESCE(${params.leaseExpiryAt ?? null}, lease_expiry_at),
      claim_tx_sig = COALESCE(${params.claimTxSig ?? null}, claim_tx_sig),
      proof_tx_sig = COALESCE(${params.proofTxSig ?? null}, proof_tx_sig)
    WHERE id = ${params.id}
    RETURNING
      id, payment_id, intent_seed_hash, recipient_hash, token_mint_address, amount,
      status, assigned_cranker_pubkey, lease_expiry_at, claim_tx_sig, proof_tx_sig, created_at
  `) as PaymentIntentRecord[];

  return rows[0] ?? null;
}

export async function listPendingIntentsWithClaimRequests(limit = 50): Promise<Array<{
  intent: PaymentIntentRecord;
  claimRequestId: string;
  destinationWallet: string | null;
  autoclaim: boolean;
}>> {
  const rows = (await sql`
    SELECT
      i.id, i.payment_id, i.intent_seed_hash, i.recipient_hash, i.token_mint_address, i.amount,
      i.status, i.assigned_cranker_pubkey, i.lease_expiry_at, i.claim_tx_sig, i.proof_tx_sig, i.created_at,
      c.id AS claim_request_id,
      c.destination_wallet AS destination_wallet,
      c.autoclaim AS autoclaim
    FROM payment_intents i
    INNER JOIN claim_requests c
      ON c.intent_id = i.id AND c.status = 'pending'
    WHERE i.status = 'pending'
    ORDER BY c.requested_at ASC
    LIMIT ${limit}
  `) as Array<
    PaymentIntentRecord & {
      claim_request_id: string;
      destination_wallet: string | null;
      autoclaim: boolean;
    }
  >;

  return rows.map((row) => {
    const { claim_request_id, destination_wallet, autoclaim, ...intent } = row;
    return {
      intent,
      claimRequestId: claim_request_id,
      destinationWallet: destination_wallet,
      autoclaim,
    };
  });
}
