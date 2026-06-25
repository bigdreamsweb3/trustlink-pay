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
//# sourceMappingURL=pru.d.ts.map