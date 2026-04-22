import { sql } from "@/app/db/client";

let paymentTraceColumnsReady: Promise<void> | null = null;

export async function ensurePaymentTraceColumns() {
  if (!paymentTraceColumnsReady) {
    paymentTraceColumnsReady = (async () => {
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS deposit_signature VARCHAR(128)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS release_signature VARCHAR(128)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS released_to_wallet VARCHAR(64)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS token_mint_address VARCHAR(64)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS sender_fee_amount NUMERIC(20, 9)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS claim_fee_amount NUMERIC(20, 9)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS escrow_vault_address VARCHAR(64)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS expiry_signature VARCHAR(128)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS expiry_at TIMESTAMPTZ`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS expired_to_pool_at TIMESTAMPTZ`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS recovery_wallet_address VARCHAR(64)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS notification_attempt_count INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS notification_last_attempt_at TIMESTAMPTZ`;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_deposit_signature
        ON payments (deposit_signature)
        WHERE deposit_signature IS NOT NULL
      `;
      await sql`
        UPDATE payments
        SET accepted_at = COALESCE(accepted_at, created_at)
        WHERE status = 'accepted'
          AND accepted_at IS NULL
      `;
      await sql`
        UPDATE payments
        SET notification_attempt_count = 1,
            notification_last_attempt_at = COALESCE(notification_last_attempt_at, notification_sent_at, created_at)
        WHERE notification_message_id IS NOT NULL
          AND notification_attempt_count = 0
      `;
    })().catch((error) => {
      paymentTraceColumnsReady = null;
      throw error;
    });
  }

  await paymentTraceColumnsReady;
}
