type Env = {
    SOLANA_RPC_URL: string;
    SOLANA_ESCROW_AUTHORITY_SECRET_KEY?: string;
    SOLANA_CLAIM_VERIFIER_SECRET_KEY?: string;
    SOLANA_MOCK_MODE: boolean;
    TSN_ENABLED: boolean;
    TSN_CREATE_INTENTS_ONCHAIN: boolean;
    TRUSTLINK_TREASURY_OWNER?: string;
};
export declare const env: Env;
export {};
