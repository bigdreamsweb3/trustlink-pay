BEGIN;

CREATE TABLE tsn_owner_authorization_nonces_v1 (
  nonce_commitment VARCHAR(128) PRIMARY KEY,
  tin_commitment VARCHAR(128) NOT NULL,
  network VARCHAR(64) NOT NULL,
  audience TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX idx_tsn_owner_authorization_nonces_expiry
  ON tsn_owner_authorization_nonces_v1 (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE tsn_authorized_devices_v1 (
  device_id UUID PRIMARY KEY,
  tin_commitment VARCHAR(128) NOT NULL,
  owner_identity_commitment VARCHAR(128) NOT NULL,
  signing_key_fingerprint VARCHAR(128) NOT NULL UNIQUE,
  signing_public_key JSONB NOT NULL,
  encryption_key_fingerprint VARCHAR(128) NOT NULL UNIQUE,
  encryption_public_key JSONB NOT NULL,
  permissions JSONB NOT NULL,
  authorized_network VARCHAR(64) NOT NULL,
  authorized_audience TEXT NOT NULL,
  history_recovery_scope VARCHAR(16) NOT NULL CHECK (history_recovery_scope IN ('all', 'recent', 'selected', 'future-only')),
  owner_authorization_commitment VARCHAR(128) NOT NULL UNIQUE,
  authorized_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_tsn_authorized_devices_tin_status
  ON tsn_authorized_devices_v1 (tin_commitment, status);

CREATE TABLE tsn_private_sessions_v1 (
  session_id UUID PRIMARY KEY,
  tin_commitment VARCHAR(128) NOT NULL,
  device_id UUID NOT NULL REFERENCES tsn_authorized_devices_v1(device_id),
  session_token_hash VARCHAR(128) NOT NULL UNIQUE,
  permissions JSONB NOT NULL,
  audience TEXT NOT NULL,
  origin TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  inactivity_expires_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  status VARCHAR(16) NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE tsn_private_request_nonces_v1 (
  nonce_commitment VARCHAR(128) PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES tsn_authorized_devices_v1(device_id),
  session_id UUID NOT NULL,
  purpose VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE tsn_encrypted_receipts_v1 (
  receipt_id UUID PRIMARY KEY,
  operation_id VARCHAR(128) NOT NULL UNIQUE,
  tin_commitment VARCHAR(128) NOT NULL,
  protocol_version VARCHAR(64) NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce VARCHAR(64) NOT NULL,
  authentication_tag VARCHAR(64) NOT NULL,
  encryption_version VARCHAR(128) NOT NULL,
  aad_commitment VARCHAR(128) NOT NULL,
  integrity_commitment VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_tsn_encrypted_receipts_tin_created
  ON tsn_encrypted_receipts_v1 (tin_commitment, created_at DESC);

CREATE TABLE tsn_receipt_key_envelopes_v1 (
  envelope_id UUID PRIMARY KEY,
  receipt_id UUID NOT NULL REFERENCES tsn_encrypted_receipts_v1(receipt_id) ON DELETE CASCADE,
  recipient_key_id VARCHAR(128) NOT NULL,
  recipient_type VARCHAR(16) NOT NULL CHECK (recipient_type IN ('device', 'recovery')),
  wrapped_dek TEXT NOT NULL,
  wrapping_algorithm VARCHAR(128) NOT NULL,
  ephemeral_public_key JSONB NOT NULL,
  nonce VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  UNIQUE (receipt_id, recipient_key_id)
);

CREATE INDEX idx_tsn_receipt_envelopes_active_recipient
  ON tsn_receipt_key_envelopes_v1 (recipient_key_id, receipt_id)
  WHERE revoked_at IS NULL;

COMMIT;
