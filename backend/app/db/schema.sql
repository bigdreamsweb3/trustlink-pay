CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(32) NOT NULL UNIQUE,
  phone_hash VARCHAR(64) NOT NULL,
  display_name VARCHAR(80) NOT NULL DEFAULT 'TrustLink User',
  trustlink_handle VARCHAR(32) NOT NULL UNIQUE,
  pin_hash VARCHAR(255) NOT NULL DEFAULT '',
  wallet_address VARCHAR(64),
  phone_verified_at TIMESTAMPTZ,
  identity_verified_at TIMESTAMPTZ,
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
  amount NUMERIC(20, 9) NOT NULL,
  escrow_account VARCHAR(64),
  notification_message_id VARCHAR(128),
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phone_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(32) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'generic',
  request_ip VARCHAR(64),
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
  ADD COLUMN IF NOT EXISTS notification_message_id VARCHAR(128);
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(80) NOT NULL DEFAULT 'TrustLink User';
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trustlink_handle VARCHAR(32);
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255);
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ;
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
UPDATE users
SET trustlink_handle = CONCAT('user_', SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8))
WHERE trustlink_handle IS NULL;
UPDATE users
SET pin_hash = ''
WHERE pin_hash IS NULL;
UPDATE payments
SET reference_code = CONCAT('TL-', UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 6)))
WHERE reference_code IS NULL;
ALTER TABLE users
  ALTER COLUMN trustlink_handle SET NOT NULL;
ALTER TABLE users
  ALTER COLUMN pin_hash SET NOT NULL;
ALTER TABLE payments
  ALTER COLUMN reference_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users (phone_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_trustlink_handle ON users (trustlink_handle);
CREATE INDEX IF NOT EXISTS idx_payments_receiver_phone_hash ON payments (receiver_phone_hash);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_notification_message_id ON payments (notification_message_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_reference_code ON payments (reference_code);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone_number ON phone_verifications (phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone_number_purpose ON phone_verifications (phone_number, purpose);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_request_ip_purpose ON phone_verifications (request_ip, purpose);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_message_id ON whatsapp_webhook_events (message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_related_payment_id ON whatsapp_webhook_events (related_payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receiver_wallets_user_wallet_name ON receiver_wallets (user_id, wallet_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receiver_wallets_user_wallet_address ON receiver_wallets (user_id, wallet_address);
