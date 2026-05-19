function parseBoolean(value, fallback) {
    if (value == null)
        return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true")
        return true;
    if (normalized === "false")
        return false;
    return fallback;
}
function requireValue(name, value) {
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
export const env = {
    SOLANA_RPC_URL: requireValue("SOLANA_RPC_URL", process.env.SOLANA_RPC_URL),
    SOLANA_ESCROW_AUTHORITY_SECRET_KEY: process.env.SOLANA_ESCROW_AUTHORITY_SECRET_KEY,
    SOLANA_CLAIM_VERIFIER_SECRET_KEY: process.env.SOLANA_CLAIM_VERIFIER_SECRET_KEY,
    SOLANA_MOCK_MODE: parseBoolean(process.env.SOLANA_MOCK_MODE, true),
    TSN_ENABLED: parseBoolean(process.env.TSN_ENABLED, false),
    TSN_CREATE_INTENTS_ONCHAIN: parseBoolean(process.env.TSN_CREATE_INTENTS_ONCHAIN, false),
    TRUSTLINK_TREASURY_OWNER: process.env.TRUSTLINK_TREASURY_OWNER,
};
