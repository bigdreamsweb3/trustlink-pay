BEGIN;

DROP INDEX IF EXISTS idx_users_tins_wallet_pubkey;

ALTER TABLE users
  DROP COLUMN IF EXISTS tins_wallet_pubkey;

COMMIT;
