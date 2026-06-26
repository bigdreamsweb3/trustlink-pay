export type TsnPrivacyLevel = 1 | 2 | 3 | 4;
export type PruLifecycleState = "PLANNED" | "ACTIVE" | "USED" | "SWEPT";
export type TsnBalanceState = "AVAILABLE" | "PENDING" | "SETTLED";
export declare const DEFAULT_PRU_COUNT: 30;
export declare const DEFAULT_PRU_PRIVACY_LEVEL: 3;
export declare const PRU_ATA_RENT_SUBSIDY_LIMIT: 3;
export type PruEndpoint = {
    tinId: string;
    index: number;
    derivedPublicKey: string;
    encryptedMetadata?: string;
    state: PruLifecycleState;
};
export type PruLifecycleRecord = {
    tinId: string;
    tokenMint?: string | null;
    pruIndex: number;
    state: PruLifecycleState;
    ataCreated: boolean;
    ataRentSubsidiesUsed: number;
    lastReceiptTxId?: string | null;
    lastSpendTxId?: string | null;
    updatedAt: string;
};
export type PruBalance = {
    pru: PruEndpoint;
    tokenMint: string;
    available: bigint;
    pending: bigint;
    settled: bigint;
};
export type PruAllocation = {
    pru: PruEndpoint;
    tokenMint: string;
    amount: bigint;
    ataAction?: "none" | "protocol_subsidized" | "activation_fee";
};
export type TsnTinBalance = {
    available: bigint;
    pending: bigint;
    settled: bigint;
    final: bigint;
};
export declare function pruCountForPrivacyLevel(_level?: TsnPrivacyLevel): 30;
export declare function derivePruPublicKey(input: {
    masterSeed: string | Uint8Array;
    tinId: string;
    index: number;
}): string;
export declare function derivePruSet(input: {
    masterSeed: string | Uint8Array;
    tinId: string;
    privacyLevel?: TsnPrivacyLevel;
    encryptedMetadataForIndex?: (index: number) => string | undefined;
    initialState?: PruLifecycleState;
}): PruEndpoint[];
export declare function computePruConfigurationHash(prus: PruEndpoint[]): string;
export declare function deterministicAllocationSeed(input: {
    txId: string;
    tinId: string;
    tokenMint: string;
}): string;
export declare function allocatePrusDeterministically(input: {
    txId: string;
    tinId: string;
    tokenMint: string;
    pruSet: PruEndpoint[];
    amount: bigint | number | string;
    lifecycle?: PruLifecycleRecord[];
}): PruAllocation[];
export declare function planLazyAtaCreation(input: {
    allocation: PruAllocation[];
    lifecycle: PruLifecycleRecord[];
    subsidyLimit?: number;
}): ({
    ataAction: "none";
    pru: PruEndpoint;
    tokenMint: string;
    amount: bigint;
} | {
    ataAction: "protocol_subsidized" | "activation_fee";
    pru: PruEndpoint;
    tokenMint: string;
    amount: bigint;
})[];
export declare function computeTinBalance(balances: PruBalance[], tokenMint?: string): TsnTinBalance;
export declare function selectRandomPruForSpend(input: {
    balances: PruBalance[];
    tokenMint: string;
    randomBytesFn?: (size: number) => Uint8Array;
}): PruEndpoint;
export declare function selectPrusForSpend(input: {
    balances: PruBalance[];
    tokenMint: string;
    amount: bigint | number | string;
    signingPru?: PruEndpoint;
}): PruAllocation[];
export declare function planPruSweep(balances: PruBalance[], tokenMint?: string): {
    pru: PruEndpoint;
    tokenMint: string;
    amount: bigint;
}[];
export type TsnScopedPruIntentMessage = {
    intent_id: string;
    tsn_domain: string;
    tin: string;
    pru_index: number;
    amount: string;
    destination_hash: string;
    expiry: number;
    nonce: number;
};
export type TsnScopedPruIntent = {
    message: TsnScopedPruIntentMessage;
    messageBytes: Uint8Array;
    pruPublicKey: string;
    pruSignature: string;
};
export declare function generateTinMasterSeed(randomBytesFn?: (size: number) => Uint8Array): Uint8Array<ArrayBufferLike>;
export declare function encryptTinMasterSeed(params: {
    tinMasterSeed: Uint8Array;
    mainWalletSignature: string | Uint8Array;
    pin: string;
}): Promise<{
    algorithm: "AES-256-GCM";
    iv: string;
    ciphertext: string;
}>;
export declare function decryptTinMasterSeed(params: {
    ciphertext: string;
    iv: string;
    mainWalletSignature: string | Uint8Array;
    pin: string;
}): Promise<Uint8Array<ArrayBuffer>>;
export declare function computeTsnDomain(tsnVaultPubkey: string | Uint8Array): string;
export declare function computeDestinationHash(recipientTin: string | number | bigint): string;
export declare function computePruSpendAuthHash(params: {
    tin: string | number | bigint;
    pruIndex: number;
    mainWalletPubkey: string | Uint8Array;
    domainTag?: string;
}): string;
export declare function createScopedPruIntent(params: {
    tinMasterSeed: Uint8Array;
    tsnVaultPubkey: string | Uint8Array;
    tin: string | number | bigint;
    pruIndex: number;
    amount: bigint | number | string;
    recipientTin: string | number | bigint;
    intentId?: string;
    nowUnixSeconds?: number;
    nonce?: number;
}): {
    message: TsnScopedPruIntentMessage;
    messageBytes: NodeJS.NonSharedUint8Array;
    pruPublicKey: string;
    pruSignature: string;
};
export declare function verifyScopedPruIntent(params: {
    intent: TsnScopedPruIntent;
    expectedTsnVaultPubkey: string | Uint8Array;
    mainWalletVerified: boolean;
    expectedTin: string | number | bigint;
    seenIntentIds?: Set<string>;
    nonceBitmask: Uint8Array;
    nowUnixSeconds?: number;
    pruActive: boolean;
}): boolean;
//# sourceMappingURL=pru.d.ts.map