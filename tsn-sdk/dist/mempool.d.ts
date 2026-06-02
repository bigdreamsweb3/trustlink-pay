import type { CreateIntentRequest, RequestClaimRequest, TsnClaimRequestStatus, TsnIntentStatus, TsnMempoolClaimRequest, TsnMempoolIntent, TsnIntentWorkItem, TsnWorkItem, ProofOfPaymentRequest } from "./contracts.js";
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
    updateIntentStatus(id: string, status: TsnIntentStatus, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent | null>;
    updateClaimRequestStatus(id: string, status: TsnClaimRequestStatus, patch?: Partial<TsnMempoolClaimRequest>): Promise<TsnMempoolClaimRequest | null>;
    postProof(request: ProofOfPaymentRequest): Promise<ProofOfPaymentRequest>;
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
    updateIntentStatus(id: string, status: TsnIntentStatus, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent>;
    updateClaimRequestStatus(id: string, status: TsnClaimRequestStatus, patch?: Partial<TsnMempoolClaimRequest>): Promise<TsnMempoolClaimRequest>;
    postProof(request: ProofOfPaymentRequest): Promise<ProofOfPaymentRequest>;
}
//# sourceMappingURL=mempool.d.ts.map