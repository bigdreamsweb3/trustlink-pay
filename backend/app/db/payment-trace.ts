import { sql } from "@/app/db/client";

let paymentTraceColumnsReady: Promise<void> | null = null;

export async function ensurePaymentTraceColumns() {
  if (!paymentTraceColumnsReady) {
    paymentTraceColumnsReady = (async () => {
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS deposit_signature VARCHAR(128)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS release_signature VARCHAR(128)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_release_signature VARCHAR(128)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS released_to_wallet VARCHAR(64)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_released_to_wallet VARCHAR(64)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_requested_at TIMESTAMPTZ`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_available_at TIMESTAMPTZ`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_claimed_at TIMESTAMPTZ`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS token_mint_address VARCHAR(64)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS sender_fee_amount NUMERIC(20, 9)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS claim_fee_amount NUMERIC(20, 9)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS escrow_vault_address VARCHAR(64)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS expiry_at TIMESTAMPTZ`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS sender_phone_identity_pubkey VARCHAR(64)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(16) DEFAULT 'secure'`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS sender_autoclaim_enabled BOOLEAN NOT NULL DEFAULT false`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receiver_autoclaim_allowed BOOLEAN NOT NULL DEFAULT false`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receiver_wallet VARCHAR(64)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS receiver_onboarded BOOLEAN NOT NULL DEFAULT false`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_receiver_pubkey VARCHAR(64)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_ephemeral_pubkey VARCHAR(128)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS notification_attempt_count INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS notification_last_attempt_at TIMESTAMPTZ`;

      await sql`ALTER TABLE payments DROP COLUMN IF EXISTS accepted_at`;
      await sql`ALTER TABLE payments DROP COLUMN IF EXISTS refund_claim_available_at`;
      await sql`ALTER TABLE payments DROP COLUMN IF EXISTS refund_extension_count`;
      await sql`ALTER TABLE payments DROP COLUMN IF EXISTS expiry_signature`;
      await sql`ALTER TABLE payments DROP COLUMN IF EXISTS expired_to_pool_at`;
      await sql`ALTER TABLE payments DROP COLUMN IF EXISTS recovery_wallet_address`;
      await sql`ALTER TABLE payments DROP COLUMN IF EXISTS recipient_onboarded_at_creation`;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_deposit_signature
        ON payments (deposit_signature)
        WHERE deposit_signature IS NOT NULL
      `;
      await sql`
        UPDATE payments
        SET status = CASE
          WHEN status = 'pending' THEN 'locked'
          WHEN status = 'accepted' THEN 'claimed'
          WHEN status = 'refund_pending' THEN 'refund_requested'
          WHEN status = 'refunded' THEN 'refunded'
          WHEN status IN ('cancelled', 'expired') THEN CASE
            WHEN refund_claimed_at IS NOT NULL OR refund_release_signature IS NOT NULL THEN 'refunded'
            ELSE 'expired'
          END
          ELSE status
        END
      `;
      await sql`
        UPDATE payments
        SET notification_attempt_count = 1,
            notification_last_attempt_at = COALESCE(notification_last_attempt_at, notification_sent_at, created_at)
        WHERE notification_message_id IS NOT NULL
          AND notification_attempt_count = 0
      `;
      await sql`
        DO $$
        BEGIN
          ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
        EXCEPTION
          WHEN undefined_object THEN NULL;
        END $$;
      `;
      await sql`
        DO $$
        BEGIN
          ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_state_check;
        EXCEPTION
          WHEN undefined_object THEN NULL;
        END $$;
      `;
      await sql`
        DO $$
        BEGIN
          ALTER TABLE payments
            ADD CONSTRAINT payments_status_check
            CHECK (status IN ('created', 'locked', 'expired', 'claimed', 'refund_requested', 'refunded'));
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `;
    })().catch((error) => {
      paymentTraceColumnsReady = null;
      throw error;
    });
  }

  await paymentTraceColumnsReady;
}
