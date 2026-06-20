export type TsnPrivacyLevel = 1 | 2 | 3 | 4;
export type PruLifecycleState = "PLANNED" | "ACTIVE" | "USED" | "SWEPT";
export type TsnBalanceState = "AVAILABLE" | "PENDING" | "SETTLED";
export type PruEndpoint = {
    tinId: string;
    tokenMint: string;
    index: number;
    derivedPublicKey: string;
    encryptedMetadata?: string;
    state: PruLifecycleState;
};
export type PruBalance = {
    pru: PruEndpoint;
    available: bigint;
    pending: bigint;
    settled: bigint;
};
export type PruAllocation = {
    pru: PruEndpoint;
    amount: bigint;
};
export type TsnTinBalance = {
    available: bigint;
    pending: bigint;
    settled: bigint;
    final: bigint;
};
export declare function pruCountForPrivacyLevel(level: TsnPrivacyLevel): 3 | 10 | 30 | 100;
export declare function derivePruPublicKey(input: {
    masterSeed: string | Uint8Array;
    tinId: string;
    tokenMint: string;
    index: number;
}): string;
export declare function derivePruSet(input: {
    masterSeed: string | Uint8Array;
    tinId: string;
    tokenMint: string;
    privacyLevel: TsnPrivacyLevel;
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
}): PruAllocation[];
export declare function computeTinBalance(balances: PruBalance[]): TsnTinBalance;
export declare function selectPrusForSpend(input: {
    balances: PruBalance[];
    amount: bigint | number | string;
}): PruAllocation[];
export declare function planPruSweep(balances: PruBalance[]): {
    pru: PruEndpoint;
    amount: bigint;
}[];
//# sourceMappingURL=pru.d.ts.map