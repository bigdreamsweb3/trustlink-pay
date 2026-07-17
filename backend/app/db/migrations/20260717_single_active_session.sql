ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_session_id UUID;

CREATE INDEX IF NOT EXISTS idx_users_active_session_id
  ON users (active_session_id)
  WHERE active_session_id IS NOT NULL;
