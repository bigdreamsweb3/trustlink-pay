CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(32) NOT NULL UNIQUE,
  phone_hash VARCHAR(64) NOT NULL,
  display_name VARCHAR(80) NOT NULL DEFAULT 'TrustLink User',
  trustlink_handle VARCHAR(32) NOT NULL UNIQUE,
  pin_hash VARCHAR(255) NOT NULL DEFAULT '',
  wallet_address VARCHAR(64),
  whatsapp_opted_in BOOLEAN NOT NULL DEFAULT false,
  opt_in_timestamp TIMESTAMPTZ,
  opt_out_timestamp TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  identity_verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_login_ip VARCHAR(64),
  referred_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  referral_source_payment_id UUID,
  referred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_wallet VARCHAR(64) NOT NULL,
  sender_display_name_snapshot VARCHAR(80) NOT NULL DEFAULT 'TrustLink User',
  sender_handle_snapshot VARCHAR(32) NOT NULL DEFAULT 'user',
  reference_code VARCHAR(16) NOT NULL DEFAULT '',
  receiver_phone VARCHAR(32) NOT NULL,
  receiver_phone_hash VARCHAR(64) NOT NULL,
  token_symbol VARCHAR(10) NOT NULL,
  token_mint_address VARCHAR(64),
  amount NUMERIC(20, 9) NOT NULL,
  sender_fee_amount NUMERIC(20, 9),
  claim_fee_amount NUMERIC(20, 9),
  escrow_account VARCHAR(64),
  escrow_vault_address VARCHAR(64),
  deposit_signature VARCHAR(128),
  release_signature VARCHAR(128),
  expiry_signature VARCHAR(128),
  released_to_wallet VARCHAR(64),
  accepted_at TIMESTAMPTZ,
  expiry_at TIMESTAMPTZ,
  expired_to_pool_at TIMESTAMPTZ,
  recovery_wallet_address VARCHAR(64),
  notification_message_id VARCHAR(128),
  notification_status VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK (notification_status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
  notification_sent_at TIMESTAMPTZ,
  notification_delivered_at TIMESTAMPTZ,
  notification_read_at TIMESTAMPTZ,
  notification_failed_at TIMESTAMPTZ,
  notification_attempt_count INTEGER NOT NULL DEFAULT 0,
  notification_last_attempt_at TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phone_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(32) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'generic',
  request_ip VARCHAR(64),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receiver_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_name VARCHAR(64) NOT NULL,
  wallet_address VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(32) NOT NULL,
  message_id VARCHAR(128),
  related_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  phone_number VARCHAR(32),
  direction VARCHAR(16),
  status VARCHAR(32),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS token_mint_address VARCHAR(64);
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS sender_fee_amount NUMERIC(20, 9);
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS claim_fee_amount NUMERIC(20, 9);
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS escrow_vault_address VARCHAR(64);
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS notification_message_id VARCHAR(128);
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS deposit_signature VARCHAR(128);
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS release_signature VARCHAR(128);
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS expiry_signature VARCHAR(128);
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS released_to_wallet VARCHAR(64);
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS expiry_at TIMESTAMPTZ;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS expired_to_pool_at TIMESTAMPTZ;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS recovery_wallet_address VARCHAR(64);
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS notification_status VARCHAR(16) DEFAULT 'queued';
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS notification_delivered_at TIMESTAMPTZ;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS notification_read_at TIMESTAMPTZ;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS notification_failed_at TIMESTAMPTZ;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS notification_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS notification_last_attempt_at TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(80) NOT NULL DEFAULT 'TrustLink User';
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trustlink_handle VARCHAR(32);
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255);
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS whatsapp_opted_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS opt_in_timestamp TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS opt_out_timestamp TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(64);
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referred_by_user_id UUID;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_source_payment_id UUID;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referred_at TIMESTAMPTZ;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS sender_display_name_snapshot VARCHAR(80) NOT NULL DEFAULT 'TrustLink User';
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS sender_handle_snapshot VARCHAR(32) NOT NULL DEFAULT 'user';
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS reference_code VARCHAR(16);
ALTER TABLE phone_verifications
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(32) NOT NULL DEFAULT 'generic';
ALTER TABLE phone_verifications
  ADD COLUMN IF NOT EXISTS request_ip VARCHAR(64);
ALTER TABLE phone_verifications
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE phone_verifications
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;

UPDATE users
SET trustlink_handle = CONCAT('user_', SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8))
WHERE trustlink_handle IS NULL;

UPDATE users
SET pin_hash = ''
WHERE pin_hash IS NULL;

UPDATE payments
SET reference_code = CONCAT('TL-', UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 6)))
WHERE reference_code IS NULL;

UPDATE payments
SET notification_status = 'queued'
WHERE notification_status IS NULL;

UPDATE payments
SET notification_status = 'sent',
    notification_sent_at = COALESCE(notification_sent_at, created_at)
WHERE notification_message_id IS NOT NULL
  AND notification_status = 'queued';

UPDATE payments
SET notification_attempt_count = 1,
    notification_last_attempt_at = COALESCE(notification_last_attempt_at, notification_sent_at, created_at)
WHERE notification_message_id IS NOT NULL
  AND notification_attempt_count = 0;

UPDATE payments
SET accepted_at = COALESCE(accepted_at, created_at)
WHERE status = 'accepted'
  AND accepted_at IS NULL;

WITH latest_receipt AS (
  SELECT DISTINCT ON (related_payment_id)
    related_payment_id,
    status,
    created_at,
    COALESCE(to_timestamp(NULLIF(payload #>> '{status,timestamp}', '')::bigint), created_at) AS occurred_at
  FROM whatsapp_webhook_events
  WHERE related_payment_id IS NOT NULL
    AND status IN ('sent', 'delivered', 'read', 'failed')
  ORDER BY
    related_payment_id,
    CASE status
      WHEN 'read' THEN 4
      WHEN 'delivered' THEN 3
      WHEN 'sent' THEN 2
      WHEN 'failed' THEN 1
      ELSE 0
    END DESC,
    created_at DESC
)
UPDATE payments AS payments_to_update
SET notification_status = latest_receipt.status,
    notification_sent_at = CASE
      WHEN latest_receipt.status IN ('sent', 'delivered', 'read')
        THEN COALESCE(payments_to_update.notification_sent_at, latest_receipt.occurred_at)
      ELSE payments_to_update.notification_sent_at
    END,
    notification_delivered_at = CASE
      WHEN latest_receipt.status IN ('delivered', 'read')
        THEN COALESCE(payments_to_update.notification_delivered_at, latest_receipt.occurred_at)
      ELSE payments_to_update.notification_delivered_at
    END,
    notification_read_at = CASE
      WHEN latest_receipt.status = 'read'
        THEN COALESCE(payments_to_update.notification_read_at, latest_receipt.occurred_at)
      ELSE payments_to_update.notification_read_at
    END,
    notification_failed_at = CASE
      WHEN latest_receipt.status = 'failed'
        THEN COALESCE(payments_to_update.notification_failed_at, latest_receipt.occurred_at)
      ELSE payments_to_update.notification_failed_at
    END
FROM latest_receipt
WHERE payments_to_update.id = latest_receipt.related_payment_id;

ALTER TABLE users
  ALTER COLUMN trustlink_handle SET NOT NULL;
ALTER TABLE users
  ALTER COLUMN pin_hash SET NOT NULL;
ALTER TABLE payments
  ALTER COLUMN reference_code SET NOT NULL;
ALTER TABLE payments
  ALTER COLUMN notification_status SET NOT NULL;
ALTER TABLE payments
  ALTER COLUMN notification_status SET DEFAULT 'queued';

DO $$
BEGIN
  ALTER TABLE payments
    ADD CONSTRAINT payments_notification_status_check
    CHECK (notification_status IN ('queued', 'sent', 'delivered', 'read', 'failed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_referred_by_user_id_fkey
    FOREIGN KEY (referred_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_referral_source_payment_id_fkey
    FOREIGN KEY (referral_source_payment_id) REFERENCES payments(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users (phone_hash);
CREATE INDEX IF NOT EXISTS idx_users_whatsapp_opted_in ON users (whatsapp_opted_in);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_trustlink_handle ON users (trustlink_handle);
CREATE INDEX IF NOT EXISTS idx_users_referred_by_user_id ON users (referred_by_user_id);
CREATE INDEX IF NOT EXISTS idx_users_referral_source_payment_id ON users (referral_source_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_receiver_phone_hash ON payments (receiver_phone_hash);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_notification_message_id ON payments (notification_message_id);
CREATE INDEX IF NOT EXISTS idx_payments_notification_status ON payments (notification_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_deposit_signature
  ON payments (deposit_signature)
  WHERE deposit_signature IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_reference_code ON payments (reference_code);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone_number ON phone_verifications (phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone_number_purpose ON phone_verifications (phone_number, purpose);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone_number_purpose_consumed_at
  ON phone_verifications (phone_number, purpose, consumed_at);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_request_ip_purpose ON phone_verifications (request_ip, purpose);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_message_id ON whatsapp_webhook_events (message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_related_payment_id ON whatsapp_webhook_events (related_payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receiver_wallets_user_wallet_name ON receiver_wallets (user_id, wallet_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receiver_wallets_user_wallet_address ON receiver_wallets (user_id, wallet_address);

