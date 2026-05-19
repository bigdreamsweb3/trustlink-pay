import { Keypair, PublicKey } from "@solana/web3.js";
export declare function sha256Bytes(input: string): Buffer;
export declare function getTsnMotherEscrowPda(): PublicKey;
export declare function getTsnIntentPda(params: {
    motherEscrow: PublicKey;
    intentSeed32: Buffer;
}): PublicKey;
export declare function getTsnCrankerPda(params: {
    motherEscrow: PublicKey;
    operator: PublicKey;
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
export declare function tsnCreateIntentOnChain(params: {
    payer?: Keypair;
    intentSeed32: Buffer;
    underlyingPayment: PublicKey;
    tokenMint: PublicKey;
    amountBaseUnits: bigint;
    recipientHash32: Buffer;
}): Promise<{
    mode: "mock";
    signature: string | null;
} | {
    mode: "devnet";
    signature: string;
}>;
export declare function tsnInitializeMotherEscrowOnChain(params: {
    authority?: Keypair;
    protocolSeed32: Buffer;
    epochSeconds: bigint;
    leaseSeconds: bigint;
    feeSplitCrankerBps?: number | null;
    feeSplitLpBps?: number | null;
    feeSplitTreasuryBps?: number | null;
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
    protocolSeed32: Buffer;
    epochSeconds: bigint;
    leaseSeconds: bigint;
    feeSplitCrankerBps?: number | null;
    feeSplitLpBps?: number | null;
    feeSplitTreasuryBps?: number | null;
}): Promise<{
    mode: "mock";
    signature: string | null;
    motherEscrow?: undefined;
} | {
    mode: "devnet";
    signature: string;
    motherEscrow: string;
}>;
export declare function tsnRegisterCrankerOnChain(params: {
    operator: Keypair;
}): Promise<{
    mode: "mock";
    signature: string | null;
    cranker?: undefined;
} | {
    mode: "devnet";
    signature: string | null;
    cranker: string;
} | {
    mode: "devnet";
    signature: string;
    cranker?: undefined;
}>;
export declare function tsnSetCrankerFundingPolicyOnChain(params: {
    operator: Keypair;
    allowExternalFunding: boolean;
}): Promise<{
    mode: "mock";
    signature: string | null;
} | {
    mode: "devnet";
    signature: string;
}>;
export declare function tsnInitializeCrankerVaultOnChain(params: {
    payer: Keypair;
    operator: PublicKey;
    tokenMint: PublicKey;
}): Promise<{
    mode: "mock";
    signature: string | null;
    crankerVault?: undefined;
    vaultTokenAccount?: undefined;
} | {
    mode: "devnet";
    signature: string;
    crankerVault: string;
    vaultTokenAccount: string;
}>;
export declare function tsnFundCrankerOnChain(params: {
    funder: Keypair;
    operator: PublicKey;
    tokenMint: PublicKey;
    funderTokenAccount: PublicKey;
    amountBaseUnits: bigint;
}): Promise<{
    mode: "mock";
    signature: string | null;
    liquidityPosition?: undefined;
} | {
    mode: "devnet";
    signature: string;
    liquidityPosition: string;
}>;
export declare function tsnWithdrawCrankerFundsOnChain(params: {
    funder: Keypair;
    operator: PublicKey;
    tokenMint: PublicKey;
    funderTokenAccount: PublicKey;
    amountBaseUnits: bigint;
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
}): Promise<{
    mode: "mock";
    signature: string | null;
} | {
    mode: "devnet";
    signature: string;
}>;
export declare function tsnClaimIntentOnChain(params: {
    operator: Keypair;
    intent: PublicKey;
}): Promise<{
    mode: "mock";
    signature: string;
} | {
    mode: "devnet";
    signature: string;
}>;
export declare function estimateTsnClaimNetworkFeeLamports(params: {
    intent: PublicKey;
    tokenMint: PublicKey;
    recipientWallet: PublicKey;
}): Promise<number>;
export declare function tsnSubmitProofOnChain(params: {
    operator: Keypair;
    intent: PublicKey;
    payoutTxSig64: Buffer;
    payoutAmountBaseUnits: bigint;
    tokenMint: PublicKey;
    recipientWallet: PublicKey;
}): Promise<{
    mode: "mock";
    signature: string;
} | {
    mode: "devnet";
    signature: string;
}>;
export declare function tsnFetchIntentOnChain(params: {
    intent: PublicKey;
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
export declare function tsnFetchMotherEscrowOnChain(): Promise<{
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
