export const PUBLIC_FIELDS = ["programId", "accounts", "signers", "amount", "token balances", "logs", "root", "nonce"];
export const COMMITMENT_FIELDS = ["fundingCommitment", "destinationCommitment", "feeAuthorizationCommitment", "authorizationCommitment"];
export function classifyFundingEvidence() { return { publicOnChain: PUBLIC_FIELDS, commitmentOnly: COMMITMENT_FIELDS, privateLocal: [], secretRedacted: ["private keys", "seed phrases", "API keys", "salt plaintext"] }; }
