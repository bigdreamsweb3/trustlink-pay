import { sql } from "@/app/db/client";
import type { ClaimRequestRecord, ClaimRequestStatus, PaymentIntentRecord, PaymentIntentStatus } from "@trustlink/tsn-sdk";

let paymentIntentSchemaReady: Promise<void> | null = null;

async function ensurePaymentIntentTraceColumns() {
  if (!paymentIntentSchemaReady) {
    paymentIntentSchemaReady = (async () => {
      await sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS escrow_tx_sig VARCHAR(128)`;
      await sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS claim_tx_sig VARCHAR(128)`;
      await sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS proof_tx_sig VARCHAR(128)`;
      await sql`
        ALTER TABLE payment_intents
        DROP CONSTRAINT IF EXISTS payment_intents_status_check
      `;
      await sql`
        ALTER TABLE payment_intents
        ADD CONSTRAINT payment_intents_status_check
        CHECK (status IN (
          'pending',
          'escrowed',
          'onchain',
          'claimed',
          'executed',
          'settled',
          'expired',
          'failed',
          'canceled',
          'reverted'
        ))
      `;
    })().catch((error) => {
      paymentIntentSchemaReady = null;
      throw error;
    });
  }

  await paymentIntentSchemaReady;
}

export async function findPaymentIntentByPaymentId(paymentId: string): Promise<PaymentIntentRecord | null> {
  await ensurePaymentIntentTraceColumns();

  const rows = (await sql`
    SELECT
      id, payment_id, intent_seed_hash, recipient_hash, token_mint_address, amount,
      status, assigned_cranker_pubkey, lease_expiry_at, escrow_tx_sig, claim_tx_sig, proof_tx_sig, created_at
    FROM payment_intents
    WHERE payment_id = ${paymentId}
    LIMIT 1
  `) as PaymentIntentRecord[];

  return rows[0] ?? null;
}

export async function listPaymentIntentsByPaymentIds(paymentIds: string[]): Promise<PaymentIntentRecord[]> {
  if (paymentIds.length === 0) return [];
  await ensurePaymentIntentTraceColumns();

  return (await sql`
    SELECT
      id, payment_id, intent_seed_hash, recipient_hash, token_mint_address, amount,
      status, assigned_cranker_pubkey, lease_expiry_at, escrow_tx_sig, claim_tx_sig, proof_tx_sig, created_at
    FROM payment_intents
    WHERE payment_id = ANY(${paymentIds}::uuid[])
  `) as PaymentIntentRecord[];
}

export async function listActivePaymentIntents(limit = 100): Promise<PaymentIntentRecord[]> {
  await ensurePaymentIntentTraceColumns();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));

  return (await sql`
    SELECT
      id, payment_id, intent_seed_hash, recipient_hash, token_mint_address, amount,
      status, assigned_cranker_pubkey, lease_expiry_at, escrow_tx_sig, claim_tx_sig, proof_tx_sig, created_at
    FROM payment_intents
    WHERE status IN ('pending', 'escrowed', 'onchain', 'claimed')
    ORDER BY created_at ASC
    LIMIT ${safeLimit}
  `) as PaymentIntentRecord[];
}

export async function upsertPaymentIntent(params: {
  id: string;
  paymentId: string;
  intentSeedHash: string;
  recipientHash: string;
  tokenMintAddress?: string | null;
  amount: number;
}): Promise<PaymentIntentRecord> {
  await ensurePaymentIntentTraceColumns();

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
      status, assigned_cranker_pubkey, lease_expiry_at, escrow_tx_sig, claim_tx_sig, proof_tx_sig, created_at
  `) as PaymentIntentRecord[];

  return rows[0];
}

export async function updatePaymentIntentStatus(params: {
  id: string;
  status: PaymentIntentStatus;
  assignedCrankerPubkey?: string | null;
  leaseExpiryAt?: string | null;
  escrowTxSig?: string | null;
  claimTxSig?: string | null;
  proofTxSig?: string | null;
}): Promise<PaymentIntentRecord | null> {
  await ensurePaymentIntentTraceColumns();

  const rows = (await sql`
    UPDATE payment_intents
    SET
      status = ${params.status},
      assigned_cranker_pubkey = COALESCE(${params.assignedCrankerPubkey ?? null}, assigned_cranker_pubkey),
      lease_expiry_at = COALESCE(${params.leaseExpiryAt ?? null}, lease_expiry_at),
      escrow_tx_sig = COALESCE(${params.escrowTxSig ?? null}, escrow_tx_sig),
      claim_tx_sig = COALESCE(${params.claimTxSig ?? null}, claim_tx_sig),
      proof_tx_sig = COALESCE(${params.proofTxSig ?? null}, proof_tx_sig)
    WHERE id = ${params.id}
    RETURNING
      id, payment_id, intent_seed_hash, recipient_hash, token_mint_address, amount,
      status, assigned_cranker_pubkey, lease_expiry_at, escrow_tx_sig, claim_tx_sig, proof_tx_sig, created_at
  `) as PaymentIntentRecord[];

  return rows[0] ?? null;
}

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
  if (paymentIds.length === 0) return [];

  return (await sql`
    SELECT DISTINCT ON (payment_id)
      id, payment_id, intent_id, recipient_hash, destination_wallet, autoclaim,
      status, requested_at, updated_at
    FROM claim_requests
    WHERE payment_id = ANY(${paymentIds}::uuid[])
    ORDER BY payment_id, requested_at DESC
  `) as ClaimRequestRecord[];
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
