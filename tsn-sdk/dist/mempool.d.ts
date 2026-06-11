import type { ClaimLeaseRecord, ClaimPointLedgerEntry, CommitmentRegistryEntry, CreateIntentRequest, LiquidityMetrics, ProofOfPaymentRequest, RecoveryQueueEntry, RequestClaimRequest, TsnClaimRequestStatus, TsnIntentStatus, TsnMempoolClaimRequest, TsnMempoolIntent, TsnIntentWorkItem, TsnWorkItem } from "./contracts.js";
export interface TsnMempool {
    postIntent(request: CreateIntentRequest): Promise<TsnMempoolIntent>;
    postClaimRequest(request: RequestClaimRequest): Promise<TsnMempoolClaimRequest>;
    listIntents(params?: {
        status?: TsnIntentStatus;
    }): Promise<TsnMempoolIntent[]>;
    listClaimRequests(params?: {
        intentId?: string;
        status?: TsnClaimRequestStatus;
    }): Promise<TsnMempoolClaimRequest[]>;
    listPendingIntentWork(limit?: number): Promise<TsnIntentWorkItem[]>;
    listPendingWork(limit?: number): Promise<TsnWorkItem[]>;
    listCommitmentRegistry(): Promise<CommitmentRegistryEntry[]>;
    listClaimPointLedger(): Promise<ClaimPointLedgerEntry[]>;
    listClaimLeases(): Promise<ClaimLeaseRecord[]>;
    listRecoveryQueue(params?: {
        status?: RecoveryQueueEntry["status"];
    }): Promise<RecoveryQueueEntry[]>;
    getLiquidityMetrics(): Promise<LiquidityMetrics>;
    submitIntentVerification(id: string, crankerPubkey: string, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent | null>;
    acquireClaimLease(intentId: string, crankerPubkey: string): Promise<ClaimLeaseRecord>;
    completeRecoveryJob(jobId: string, crankerPubkey: string, proofTx: string): Promise<RecoveryQueueEntry | null>;
    updateIntentStatus(id: string, status: TsnIntentStatus, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent | null>;
    updateClaimRequestStatus(id: string, status: TsnClaimRequestStatus, patch?: Partial<TsnMempoolClaimRequest>): Promise<TsnMempoolClaimRequest | null>;
    postProof(request: ProofOfPaymentRequest): Promise<ProofOfPaymentRequest>;
}
export declare class JsonFileTsnMempool implements TsnMempool {
    private readonly path;
    constructor(path?: string);
    postIntent(request: CreateIntentRequest): Promise<TsnMempoolIntent>;
    postClaimRequest(request: RequestClaimRequest): Promise<TsnMempoolClaimRequest>;
    listIntents(params?: {
        status?: TsnIntentStatus;
    }): Promise<TsnMempoolIntent[]>;
    listClaimRequests(params?: {
        intentId?: string;
        status?: TsnClaimRequestStatus;
    }): Promise<TsnMempoolClaimRequest[]>;
    listPendingWork(limit?: number): Promise<TsnWorkItem[]>;
    listPendingIntentWork(limit?: number): Promise<TsnIntentWorkItem[]>;
    listCommitmentRegistry(): Promise<CommitmentRegistryEntry[]>;
    listClaimPointLedger(): Promise<ClaimPointLedgerEntry[]>;
    listClaimLeases(): Promise<ClaimLeaseRecord[]>;
    listRecoveryQueue(params?: {
        status?: RecoveryQueueEntry["status"];
    }): Promise<RecoveryQueueEntry[]>;
    getLiquidityMetrics(): Promise<LiquidityMetrics>;
    submitIntentVerification(id: string, crankerPubkey: string, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent | null>;
    acquireClaimLease(intentId: string, crankerPubkey: string): Promise<ClaimLeaseRecord>;
    updateIntentStatus(id: string, status: TsnIntentStatus, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent | null>;
    updateClaimRequestStatus(id: string, status: TsnClaimRequestStatus, patch?: Partial<TsnMempoolClaimRequest>): Promise<TsnMempoolClaimRequest | null>;
    postProof(request: ProofOfPaymentRequest): Promise<ProofOfPaymentRequest>;
    completeRecoveryJob(jobId: string, crankerPubkey: string, proofTx: string): Promise<RecoveryQueueEntry | null>;
}
export declare class HttpTsnMempool implements TsnMempool {
    private readonly client;
    constructor(baseUrl?: string | undefined);
    postIntent(request: CreateIntentRequest): Promise<TsnMempoolIntent>;
    postClaimRequest(request: RequestClaimRequest): Promise<TsnMempoolClaimRequest>;
    listIntents(params?: {
        status?: TsnIntentStatus;
    }): Promise<TsnMempoolIntent[]>;
    listClaimRequests(params?: {
        intentId?: string;
        status?: TsnClaimRequestStatus;
    }): Promise<TsnMempoolClaimRequest[]>;
    listPendingWork(limit?: number): Promise<TsnWorkItem[]>;
    listPendingIntentWork(limit?: number): Promise<TsnIntentWorkItem[]>;
    listCommitmentRegistry(): Promise<CommitmentRegistryEntry[]>;
    listClaimPointLedger(): Promise<ClaimPointLedgerEntry[]>;
    listClaimLeases(): Promise<ClaimLeaseRecord[]>;
    listRecoveryQueue(params?: {
        status?: RecoveryQueueEntry["status"];
    }): Promise<RecoveryQueueEntry[]>;
    getLiquidityMetrics(): Promise<LiquidityMetrics>;
    submitIntentVerification(id: string, crankerPubkey: string, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent>;
    acquireClaimLease(intentId: string, crankerPubkey: string): Promise<ClaimLeaseRecord>;
    completeRecoveryJob(jobId: string, crankerPubkey: string, proofTx: string): Promise<RecoveryQueueEntry>;
    updateIntentStatus(id: string, status: TsnIntentStatus, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent>;
    updateClaimRequestStatus(id: string, status: TsnClaimRequestStatus, patch?: Partial<TsnMempoolClaimRequest>): Promise<TsnMempoolClaimRequest>;
    postProof(request: ProofOfPaymentRequest): Promise<ProofOfPaymentRequest>;
}
//# sourceMappingURL=mempool.d.ts.map