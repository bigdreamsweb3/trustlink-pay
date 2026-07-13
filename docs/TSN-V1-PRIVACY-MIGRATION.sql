-- TSN V1 Privacy Architecture Database Migration
-- Version: 2026-07-10
-- 
-- This migration implements the privacy-preserving schema for TSN V1.
-- Key principles:
-- - Private settlement information is encrypted before storage
-- - Sensitive fields are removed from plaintext tables
-- - New tables support device identity and private sessions

BEGIN;

-- =============================================================================
-- NEW TABLES FOR PRIVACY ARCHITECTURE
-- =============================================================================

-- Private Receipts: Encrypted settlement receipts
-- CRITICAL: Stores ciphertext only, NEVER plaintext settlement data
CREATE TABLE IF NOT EXISTS private_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  tin_hash VARCHAR(64) NOT NULL,
  ciphertext BYTEA NOT NULL,
  encryption_metadata JSONB NOT NULL,
  -- Non-sensitive metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  -- Indexes
  CONSTRAINT unique_payment_receipt UNIQUE(payment_id)
);

CREATE INDEX idx_private_receipts_tin_hash ON private_receipts (tin_hash);
CREATE INDEX idx_private_receipts_payment_id ON private_receipts (payment_id);
CREATE INDEX idx_private_receipts_expires_at ON private_receipts (expires_at);

-- Device Registry: Authorized devices for private view access
CREATE TABLE IF NOT EXISTS device_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(64) NOT NULL,
  device_signing_public_key VARCHAR(64) NOT NULL,
  device_encryption_public_key VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  -- Indexes
  CONSTRAINT unique_user_device UNIQUE(user_id, device_id)
);

CREATE INDEX idx_device_registry_user_id ON device_registry (user_id);
CREATE INDEX idx_device_registry_device_id ON device_registry (device_id);
CREATE INDEX idx_device_registry_status ON device_registry (status);
CREATE INDEX idx_device_registry_signing_key ON device_registry (device_signing_public_key);

-- Private Sessions: Time-limited sessions for private view access
CREATE TABLE IF NOT EXISTS private_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tin VARCHAR(32) NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  device_signing_public_key VARCHAR(64) NOT NULL,
  session_token_hash VARCHAR(64) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_accessed_at TIMESTAMPTZ,
  -- Indexes
  CONSTRAINT unique_session_token UNIQUE(session_token_hash)
);

CREATE INDEX idx_private_sessions_user_id ON private_sessions (user_id);
CREATE INDEX idx_private_sessions_tin ON private_sessions (tin);
CREATE INDEX idx_private_sessions_device_id ON private_sessions (device_id);
CREATE INDEX idx_private_sessions_status ON private_sessions (status);
CREATE INDEX idx_private_sessions_expires_at ON private_sessions (expires_at);

-- Nonce tracking for replay protection
CREATE TABLE IF NOT EXISTS session_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(64) NOT NULL,
  nonce_hash VARCHAR(64) NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Indexes
  CONSTRAINT unique_nonce UNIQUE(user_id, device_id, nonce_hash, purpose)
);

CREATE INDEX idx_session_nonces_expires_at ON session_nonces (expires_at);

-- =============================================================================
-- REMOVE SENSITIVE FIELDS FROM EXISTING TABLES
-- =============================================================================

-- CRITICAL: These fields expose private settlement information
-- They should be removed once migration to encrypted receipts is complete

-- Mark columns as deprecated (will be dropped in final migration)
COMMENT ON COLUMN payments.sender_wallet IS 'DEPRECATED: Will be removed. Use private_receipts for settlement data.';
COMMENT ON COLUMN payments.receiver_wallet IS 'DEPRECATED: Will be removed. Use private_receipts for settlement data.';
COMMENT ON COLUMN payments.deposit_signature IS 'DEPRECATED: Will be removed. Use private_receipts for settlement data.';
COMMENT ON COLUMN payments.release_signature IS 'DEPRECATED: Will be removed. Use private_receipts for settlement data.';
COMMENT ON COLUMN payments.refund_release_signature IS 'DEPRECATED: Will be removed. Use private_receipts for settlement data.';
COMMENT ON COLUMN payments.ephemeral_pubkey IS 'DEPRECATED: Will be removed.';
COMMENT ON COLUMN payments.refund_ephemeral_pubkey IS 'DEPRECATED: Will be removed.';

-- Remove settlement signatures from payment_intents
COMMENT ON COLUMN payment_intents.escrow_tx_sig IS 'DEPRECATED: Will be removed. Use private_receipts for settlement data.';
COMMENT ON COLUMN payment_intents.claim_tx_sig IS 'DEPRECATED: Will be removed. Use private_receipts for settlement data.';
COMMENT ON COLUMN payment_intents.proof_tx_sig IS 'DEPRECATED: Will be removed. Use private_receipts for settlement data.';

-- Remove destination wallet from claim_requests
COMMENT ON COLUMN claim_requests.destination_wallet IS 'DEPRECATED: Will be removed. Use private_receipts for settlement data.';

-- Remove sensitive wallet fields from users
COMMENT ON COLUMN users.settlement_wallet_pubkey IS 'DEPRECATED: Will be removed. Stored encrypted in device_registry.';
COMMENT ON COLUMN users.recovery_wallet_pubkey IS 'DEPRECATED: Will be removed. Encrypted backup only.';
COMMENT ON COLUMN users.privacy_view_pubkey IS 'DEPRECATED: Will be removed. Stored in device_registry.';
COMMENT ON COLUMN users.privacy_spend_pubkey IS 'DEPRECATED: Will be removed. Stored in device_registry.';

-- =============================================================================
-- HASH-COMMITTED ALTERNatives (replacing plaintext)
-- =============================================================================

-- Settlement hash commitment for verification without exposure
ALTER TABLE payments ADD COLUMN IF NOT EXISTS settlement_commitment_hash VARCHAR(64);

COMMENT ON COLUMN payments.settlement_commitment_hash IS 
  'SHA-256 hash of settlement details for verification without exposing plaintext.';

-- Owner binding commitment
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_commitment_hash VARCHAR(64);

COMMENT ON COLUMN users.owner_commitment_hash IS 
  'SHA-256 hash of owner binding for device authorization without exposing wallet.';

-- =============================================================================
-- MIGRATION HELPERS
-- =============================================================================

-- Function to encrypt and store a private receipt
CREATE OR REPLACE FUNCTION create_private_receipt(
  p_payment_id UUID,
  p_tin_hash VARCHAR,
  p_ciphertext BYTEA,
  p_encryption_metadata JSONB,
  p_expires_at TIMESTAMPTZ
) RETURNS UUID AS $$
DECLARE
  v_receipt_id UUID;
BEGIN
  INSERT INTO private_receipts (
    id, payment_id, tin_hash, ciphertext, encryption_metadata, expires_at
  ) VALUES (
    gen_random_uuid(), p_payment_id, p_tin_hash, p_ciphertext, p_encryption_metadata, p_expires_at
  ) RETURNING id INTO v_receipt_id;
  
  RETURN v_receipt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a device registration
CREATE OR REPLACE FUNCTION create_device_registration(
  p_user_id UUID,
  p_device_id VARCHAR,
  p_device_signing_public_key VARCHAR,
  p_device_encryption_public_key VARCHAR,
  p_permissions JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_device_id UUID;
BEGIN
  INSERT INTO device_registry (
    id, user_id, device_id, device_signing_public_key, 
    device_encryption_public_key, permissions
  ) VALUES (
    gen_random_uuid(), p_user_id, p_device_id, p_device_signing_public_key,
    p_device_encryption_public_key, p_permissions
  ) RETURNING id INTO v_device_id;
  
  RETURN v_device_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a private session
CREATE OR REPLACE FUNCTION create_private_session(
  p_user_id UUID,
  p_tin VARCHAR,
  p_device_id VARCHAR,
  p_device_signing_public_key VARCHAR,
  p_session_token_hash VARCHAR,
  p_permissions JSONB DEFAULT '{}',
  p_ttl_hours INTEGER DEFAULT 2
) RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_expires_at := NOW() + (p_ttl_hours || ' hours')::INTERVAL;
  
  INSERT INTO private_sessions (
    id, user_id, tin, device_id, device_signing_public_key,
    session_token_hash, permissions, expires_at
  ) VALUES (
    gen_random_uuid(), p_user_id, p_tin, p_device_id, p_device_signing_public_key,
    p_session_token_hash, p_permissions, v_expires_at
  ) RETURNING id INTO v_session_id;
  
  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record a nonce for replay protection
CREATE OR REPLACE FUNCTION record_nonce(
  p_user_id UUID,
  p_device_id VARCHAR,
  p_nonce_hash VARCHAR,
  p_purpose VARCHAR,
  p_expires_at TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
DECLARE
  v_existing INTEGER;
BEGIN
  -- Check if nonce already exists
  SELECT COUNT(*) INTO v_existing
  FROM session_nonces
  WHERE user_id = p_user_id 
    AND device_id = p_device_id 
    AND nonce_hash = p_nonce_hash 
    AND purpose = p_purpose;
  
  IF v_existing > 0 THEN
    RETURN FALSE; -- Nonce already used
  END IF;
  
  INSERT INTO session_nonces (
    id, user_id, device_id, nonce_hash, purpose, expires_at
  ) VALUES (
    gen_random_uuid(), p_user_id, p_device_id, p_nonce_hash, p_purpose, p_expires_at
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate and consume nonce (returns TRUE if valid and consumed)
CREATE OR REPLACE FUNCTION validate_and_consume_nonce(
  p_user_id UUID,
  p_device_id VARCHAR,
  p_nonce_hash VARCHAR,
  p_purpose VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Delete and count expired nonces
  DELETE FROM session_nonces WHERE expires_at < NOW();
  
  -- Check if nonce exists and delete it (one-time use)
  WITH deleted AS (
    DELETE FROM session_nonces
    WHERE user_id = p_user_id 
      AND device_id = p_device_id 
      AND nonce_hash = p_nonce_hash 
      AND purpose = p_purpose
      AND expires_at > NOW()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM deleted;
  
  RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired sessions (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE private_sessions 
  SET status = 'expired'
  WHERE status = 'active' AND expires_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired nonces (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_nonces() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM session_nonces WHERE expires_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VIEWS FOR SAFE DATA ACCESS
-- =============================================================================

-- View for receipt metadata only (no ciphertext)
CREATE OR REPLACE VIEW private_receipts_metadata AS
SELECT 
  id,
  payment_id,
  tin_hash,
  created_at,
  expires_at
FROM private_receipts;

-- View for active sessions only
CREATE OR REPLACE VIEW active_private_sessions AS
SELECT 
  id,
  user_id,
  tin,
  device_id,
  permissions,
  created_at,
  expires_at,
  last_accessed_at
FROM private_sessions
WHERE status = 'active' AND expires_at > NOW();

-- =============================================================================
-- GRANT PERMISSIONS (adjust for your setup)
-- =============================================================================

-- Example: Grant read access to metadata views
-- GRANT SELECT ON private_receipts_metadata TO app_role;
-- GRANT SELECT ON active_private_sessions TO app_role;

-- =============================================================================
-- FINAL MIGRATION STEPS (to be run after all receipts migrated)
-- =============================================================================

-- These columns should be dropped in a final migration after all data is migrated:
-- ALTER TABLE payments DROP COLUMN IF EXISTS sender_wallet;
-- ALTER TABLE payments DROP COLUMN IF EXISTS receiver_wallet;
-- ALTER TABLE payments DROP COLUMN IF EXISTS deposit_signature;
-- ALTER TABLE payments DROP COLUMN IF EXISTS release_signature;
-- ALTER TABLE payments DROP COLUMN IF EXISTS refund_release_signature;
-- ALTER TABLE payments DROP COLUMN IF EXISTS ephemeral_pubkey;
-- ALTER TABLE payments DROP COLUMN IF EXISTS refund_ephemeral_pubkey;
-- ALTER TABLE payment_intents DROP COLUMN IF EXISTS escrow_tx_sig;
-- ALTER TABLE payment_intents DROP COLUMN IF EXISTS claim_tx_sig;
-- ALTER TABLE payment_intents DROP COLUMN IF EXISTS proof_tx_sig;
-- ALTER TABLE claim_requests DROP COLUMN IF EXISTS destination_wallet;
-- ALTER TABLE users DROP COLUMN IF EXISTS settlement_wallet_pubkey;
-- ALTER TABLE users DROP COLUMN IF EXISTS recovery_wallet_pubkey;
-- ALTER TABLE users DROP COLUMN IF EXISTS privacy_view_pubkey;
-- ALTER TABLE users DROP COLUMN IF EXISTS privacy_spend_pubkey;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check that new tables exist
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('private_receipts', 'device_registry', 'private_sessions', 'session_nonces');

-- Check encryption_metadata structure
-- SELECT jsonb_object_keys(encryption_metadata) FROM private_receipts LIMIT 1;

-- Count records
-- SELECT 'private_receipts' as table_name, COUNT(*) as count FROM private_receipts
-- UNION ALL SELECT 'device_registry', COUNT(*) FROM device_registry
-- UNION ALL SELECT 'private_sessions', COUNT(*) FROM private_sessions;
