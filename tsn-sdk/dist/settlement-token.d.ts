export declare const TSN_SETTLEMENT_TOKEN_VERSION = 1;
export declare const TSN_SETTLEMENT_TOKEN_ALGORITHM = "TSN-HKDF-SHA256-STREAM-HMAC";
export type SettlementTokenPlaintext = {
    transferId: string;
    recipientHash: string;
    tokenMintAddress: string;
    amount: number;
    epoch: number;
    nonce: string;
    issuedAt: string;
};
export type EncryptedSettlementToken = {
    version: number;
    algorithm: typeof TSN_SETTLEMENT_TOKEN_ALGORITHM;
    salt: string;
    nonce: string;
    aad: string;
    aadHash: string;
    authorizedCrankerDnaHash: string;
    ciphertext: string;
    tag: string;
};
export type SettlementTokenBundle = {
    plaintext: SettlementTokenPlaintext;
    encryptedSettlementToken: string;
    commitmentHash: string;
};
export type OneTimeDecryptionToken = {
    id: string;
    transferId: string;
    leaseId: string;
    crankerPubkey: string;
    commitmentHash: string;
    issuedAt: string;
    expiresAt: string;
    tokenHash: string;
};
export declare function settlementSha256Hex(input: string | Buffer | Uint8Array): string;
export declare function canonicalJson(value: unknown): string;
export declare function settlementTokenCommitmentHash(plaintext: SettlementTokenPlaintext): string;
export declare function crankerDnaHash(value: string): string;
export declare function createEncryptedSettlementToken(params: {
    transferId: string;
    recipientHash: string;
    tokenMintAddress: string;
    amount: number;
    epoch: number;
    authorizedCrankerDnaHash?: string | null;
    masterKey?: string | Buffer | Uint8Array;
    issuedAt?: string;
}): SettlementTokenBundle;
export declare function decodeEncryptedSettlementToken(value: string): EncryptedSettlementToken;
export declare function decryptSettlementToken(params: {
    encryptedSettlementToken: string;
    transferId: string;
    commitmentHash: string;
    authorizedCrankerDnaHash?: string | null;
    masterKey?: string | Buffer | Uint8Array;
}): SettlementTokenPlaintext;
export declare function createOneTimeDecryptionToken(params: {
    transferId: string;
    leaseId: string;
    crankerPubkey: string;
    commitmentHash: string;
    ttlMs?: number;
    issuedAt?: string;
    masterKey?: string | Buffer | Uint8Array;
}): OneTimeDecryptionToken;
export declare function currentTsnEpoch(epochMs?: number): number;
//# sourceMappingURL=settlement-token.d.ts.map