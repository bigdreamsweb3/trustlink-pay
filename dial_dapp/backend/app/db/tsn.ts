import { sql } from "@/app/db/client";
import type { PaymentIntentRecord, PaymentIntentStatus } from "@trustlink/tsn-sdk";

let paymentIntentSchemaReady: Promise<void> | null = null;

async function ensurePaymentIntentTraceColumns() {
  if (!paymentIntentSchemaReady) {
    paymentIntentSchemaReady = (async () => {
      await sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS funding_tx_sig VARCHAR(128)`;
      await sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS settlement_tx_sig VARCHAR(128)`;
      await sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS last_status_checked_at TIMESTAMPTZ`;
      await sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS status_finalized_at TIMESTAMPTZ`;
      await sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS status_check_count INTEGER NOT NULL DEFAULT 0`;
      await sql`
        ALTER TABLE payment_intents
        DROP CONSTRAINT IF EXISTS payment_intents_status_check
      `;
      await sql`
        ALTER TABLE payment_intents
        ADD CONSTRAINT payment_intents_status_check
        CHECK (status IN (
          'pending',
          'onchain',
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
      status, assigned_cranker_pubkey, lease_expiry_at, funding_tx_sig, settlement_tx_sig, created_at
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
      status, assigned_cranker_pubkey, lease_expiry_at, funding_tx_sig, settlement_tx_sig, created_at
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
      status, assigned_cranker_pubkey, lease_expiry_at, funding_tx_sig, settlement_tx_sig, created_at
    FROM payment_intents
    WHERE status IN ('pending', 'onchain')
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
      status, assigned_cranker_pubkey, lease_expiry_at, funding_tx_sig, settlement_tx_sig, created_at
  `) as PaymentIntentRecord[];

  return rows[0];
}

export async function updatePaymentIntentStatus(params: {
  id: string;
  status: PaymentIntentStatus;
  assignedCrankerPubkey?: string | null;
  leaseExpiryAt?: string | null;
  fundingTxSig?: string | null;
  settlementTxSig?: string | null;
}): Promise<PaymentIntentRecord | null> {
  await ensurePaymentIntentTraceColumns();

  const rows = (await sql`
    UPDATE payment_intents
    SET
      status = ${params.status},
      assigned_cranker_pubkey = COALESCE(${params.assignedCrankerPubkey ?? null}, assigned_cranker_pubkey),
      lease_expiry_at = COALESCE(${params.leaseExpiryAt ?? null}, lease_expiry_at),
      funding_tx_sig = COALESCE(${params.fundingTxSig ?? null}, funding_tx_sig),
      settlement_tx_sig = COALESCE(${params.settlementTxSig ?? null}, settlement_tx_sig)
    WHERE id = ${params.id}
    RETURNING
      id, payment_id, intent_seed_hash, recipient_hash, token_mint_address, amount,
      status, assigned_cranker_pubkey, lease_expiry_at, funding_tx_sig, settlement_tx_sig, created_at
  `) as PaymentIntentRecord[];

  return rows[0] ?? null;
}

