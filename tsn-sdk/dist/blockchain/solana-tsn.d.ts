import { Keypair, PublicKey } from "@solana/web3.js";
export declare function sha256Bytes(input: string): Buffer;
export declare function getTsnMotherEscrowPda(): PublicKey;
export declare function getTsnIntentPda(params: {
    motherEscrow: PublicKey;
    intentSeed32: Buffer;
}): PublicKey;
export declare function getTsnVerifierPda(): PublicKey;
export declare function getTsnTreasuryPda(): PublicKey;
export declare function getTsnCrankerPda(params: {
    motherEscrow: PublicKey;
    operator: PublicKey;
}): PublicKey;
export declare function getTsnEpochAccountPda(params: {
    motherEscrow: PublicKey;
    epochId: bigint | number;
}): PublicKey;
export declare function getTsnPeaPda(params: {
    epochId: bigint | number;
    tokenMint: PublicKey;
}): PublicKey;
export declare function getTsnCrankerVaultPda(params: {
    cranker: PublicKey;
    tokenMint: PublicKey;
}): PublicKey;
export declare function getTsnCrankerVaultAuthorityPda(params: {
    crankerVault: PublicKey;
}): PublicKey;
export declare function getTsnCrankerVaultTokenPda(params: {
    crankerVault: PublicKey;
}): PublicKey;
export declare function getTsnLiquidityPositionPda(params: {
    crankerVault: PublicKey;
    funder: PublicKey;
}): PublicKey;
export declare function estimateTsnClaimNetworkFeeLamports(params: {
    tokenMint: PublicKey;
    recipientWallet: PublicKey;
}): Promise<number>;
export declare function tsnCreateIntentOnChain(params: {
    payer?: Keypair;
    intentSeed32: Buffer;
    underlyingPayment: PublicKey;
    tokenMint: PublicKey;
    amountBaseUnits: bigint;
    recipientHash32: Buffer;
    rpcUrl?: string;
    secretKey?: string | null;
}): Promise<{
    mode: "mock";
    signature: string | null;
} | {
    mode: "devnet";
    signature: string;
}>;
export declare function getTsnPaymentVaultPda(paymentIntentId: bigint): PublicKey;
export declare function tsnSubmitSenderSignedSettlementTransaction(params: {
    operator: Keypair;
    signedTransactionBase64: string;
    rpcUrl?: string;
}): Promise<{
    mode: "devnet";
    signature: string;
}>;
export declare function tsnInitializeMotherEscrowOnChain(params: {
    authority?: Keypair;
    tinsProgramId: PublicKey;
    protocolSeed32: Buffer;
    epochSeconds: bigint;
    leaseSeconds: bigint;
    feeSplitCrankerBps?: number | null;
    feeSplitLpBps?: number | null;
    feeSplitTreasuryBps?: number | null;
    rpcUrl?: string;
    secretKey?: string | null;
}): Promise<{
    mode: "mock";
    signature: string | null;
    motherEscrow?: undefined;
} | {
    mode: "devnet";
    signature: string | null;
    motherEscrow: string;
} | {
    mode: "devnet";
    signature: string;
    motherEscrow?: undefined;
}>;
export declare function tsnMigrateMotherEscrowOnChain(params: {
    authority?: Keypair;
    tinsProgramId: PublicKey;
    protocolSeed32: Buffer;
    epochSeconds: bigint;
    leaseSeconds: bigint;
    feeSplitCrankerBps?: number | null;
    feeSplitLpBps?: number | null;
    feeSplitTreasuryBps?: number | null;
    rpcUrl?: string;
    secretKey?: string | null;
}): Promise<{
    mode: "mock";
    signature: string | null;
} | {
    mode: "devnet";
    signature: string;
}>;
export declare function tsnSettleEpochOnChain(params: {
    authority?: Keypair;
    force?: boolean;
    rpcUrl?: string;
    secretKey?: string | null;
}): Promise<{
    mode: "mock";
    signature: string | null;
} | {
    mode: "devnet";
    signature: string;
}>;
export declare function tsnProcessBatchReimbursementOnChain(params: {
    operator?: Keypair;
    epochId: bigint | number;
    recomputedRootHash: Buffer | Uint8Array | string;
    totalToDistribute: bigint | number | string;
    crankerCreditSumMod: bigint | number | string;
    rpcUrl?: string;
    secretKey?: string | null;
    computeUnitPriceMicroLamports?: number | bigint | null;
}): Promise<{
    mode: "mock";
    signature: string | null;
    epochAccount?: undefined;
    cranker?: undefined;
} | {
    mode: "devnet";
    signature: string;
    epochAccount: string;
    cranker: string;
}>;
export declare function tsnRegisterCrankerOnChain(params: {
    operator?: Keypair;
    rpcUrl?: string;
    secretKey?: string | null;
}): Promise<{
    mode: "mock";
    signature: string | null;
} | {
    mode: "devnet";
    signature: string | null;
}>;
export declare function tsnSetCrankerFundingPolicyOnChain(params: {
    operator: Keypair;
    allowExternalFunding: boolean;
    rpcUrl?: string;
}): Promise<{
    mode: "devnet";
    signature: string;
}>;
export declare function tsnInitializeCrankerVaultOnChain(params: {
    payer?: Keypair;
    operator: PublicKey;
    tokenMint: PublicKey;
    rpcUrl?: string;
    secretKey?: string | null;
}): Promise<{
    mode: "mock";
    signature: string | null;
} | {
    mode: "devnet";
    signature: string;
}>;
export declare function tsnFundCrankerOnChain(params: {
    funder: Keypair;
    operator: PublicKey;
    tokenMint: PublicKey;
    funderTokenAccount: PublicKey;
    amountBaseUnits: bigint;
    rpcUrl?: string;
}): Promise<{
    mode: "devnet";
    signature: string;
}>;
export declare function tsnWithdrawCrankerFundsOnChain(params: {
    funder: Keypair;
    operator: PublicKey;
    tokenMint: PublicKey;
    funderTokenAccount: PublicKey;
    amountBaseUnits: bigint;
    rpcUrl?: string;
}): Promise<{
    mode: "devnet";
    signature: string;
}>;
export declare function tsnClaimIntentOnChain(params: {
    operator: Keypair;
    intent: PublicKey;
    rpcUrl?: string;
}): Promise<{
    mode: "devnet";
    signature: string;
}>;
export declare function tsnReassignIntentOnChain(params: {
    authority: Keypair;
    intent: PublicKey;
    rpcUrl?: string;
}): Promise<{
    mode: "devnet";
    signature: string;
}>;
export declare function tsnSubmitProofOnChain(params: {
    operator: Keypair;
    intent: PublicKey;
    tokenMint: PublicKey;
    recipientWallet: PublicKey;
    payoutTxSig64: Uint8Array;
    payoutAmountBaseUnits: bigint;
    rpcUrl?: string;
    treasuryOwner?: string | null;
}): Promise<{
    mode: "devnet";
    signature: string;
}>;
export declare function tsnClaimVaultSettlementOnChain(params: {
    operator: Keypair;
    paymentIntentId: bigint;
    otdtHash32: Uint8Array;
    rpcUrl?: string;
}): Promise<{
    mode: "devnet";
    signature: string;
    paymentVault: string;
}>;
export declare function tsnExecuteVaultPayoutOnChain(params: {
    operator: Keypair;
    paymentIntentId: bigint;
    tokenMint: PublicKey;
    recipientWallet: PublicKey;
    payoutAmountBaseUnits: bigint;
    claimFeeAmountBaseUnits?: bigint;
    otdt: Uint8Array;
    decryptionSecret: Uint8Array;
    rpcUrl?: string;
}): Promise<{
    mode: "devnet";
    signature: string;
}>;
export declare function tsnClaimVaultRecoveryOnChain(params: {
    operator: Keypair;
    paymentIntentId: bigint;
    rpcUrl?: string;
}): Promise<{
    mode: "devnet";
    signature: string;
    paymentVault: string;
}>;
export declare function tsnRecoverPaymentVaultOnChain(params: {
    operator: Keypair;
    paymentIntentId: bigint;
    tokenMint: PublicKey;
    settlementCrankerOperator: PublicKey;
    rpcUrl?: string;
}): Promise<{
    mode: "devnet";
    signature: string;
    paymentVault: string;
}>;
export declare function tsnFetchIntentOnChain(params: {
    intent: PublicKey;
    rpcUrl?: string;
}): Promise<{
    motherEscrow: PublicKey;
    intentId: Buffer<ArrayBuffer>;
    underlyingPayment: PublicKey;
    tokenMint: PublicKey;
    amount: bigint;
    recipientHash32: Buffer<ArrayBuffer>;
    status: number;
    assignedCranker: PublicKey;
    leaseExpiryTs: bigint;
    proofSubmitted: boolean;
    payoutTxSigBase58: string | null;
    createdAtTs: bigint;
    executedAtTs: bigint;
    settledEpochId: bigint;
    bump: number;
} | null>;
export declare function tsnFetchMotherEscrowOnChain(rpcUrl?: string): Promise<{
    valid: false;
    reason: "account-too-small";
    address: string;
    owner: string;
    lamports: number;
    executable: boolean;
    dataLength: number;
    discriminatorHex: string;
} | {
    valid: false;
    reason: "wrong-discriminator";
    expectedDiscriminatorHex: string;
    address: string;
    owner: string;
    lamports: number;
    executable: boolean;
    dataLength: number;
    discriminatorHex: string;
} | {
    valid: true;
    authority: string;
    tinsProgramId: string;
    protocolSeed: Buffer<ArrayBuffer>;
    epochSeconds: bigint;
    leaseSeconds: bigint;
    feeSplitCrankerBps: number;
    feeSplitLpBps: number;
    feeSplitTreasuryBps: number;
    epochId: bigint;
    lastEpochSettledTs: bigint;
    bump: number;
    address: string;
    owner: string;
    lamports: number;
    executable: boolean;
    dataLength: number;
    discriminatorHex: string;
} | null>;
//# sourceMappingURL=solana-tsn.d.ts.map