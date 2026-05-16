type Env = {
  SOLANA_RPC_URL: string;
  SOLANA_ESCROW_AUTHORITY_SECRET_KEY?: string;
  SOLANA_CLAIM_VERIFIER_SECRET_KEY?: string;
  SOLANA_MOCK_MODE: boolean;
  TSN_ENABLED: boolean;
  TSN_CREATE_INTENTS_ONCHAIN: boolean;
  TRUSTLINK_TREASURY_OWNER?: string;
};

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

function requireValue(name: string, value?: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env: Env = {
  SOLANA_RPC_URL: requireValue("SOLANA_RPC_URL", process.env.SOLANA_RPC_URL),
  SOLANA_ESCROW_AUTHORITY_SECRET_KEY: process.env.SOLANA_ESCROW_AUTHORITY_SECRET_KEY,
  SOLANA_CLAIM_VERIFIER_SECRET_KEY: process.env.SOLANA_CLAIM_VERIFIER_SECRET_KEY,
  SOLANA_MOCK_MODE: parseBoolean(process.env.SOLANA_MOCK_MODE, true),
  TSN_ENABLED: parseBoolean(process.env.TSN_ENABLED, false),
  TSN_CREATE_INTENTS_ONCHAIN: parseBoolean(process.env.TSN_CREATE_INTENTS_ONCHAIN, false),
  TRUSTLINK_TREASURY_OWNER: process.env.TRUSTLINK_TREASURY_OWNER,
};
