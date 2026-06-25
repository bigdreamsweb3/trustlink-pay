import type { CreateIntentRequest, RequestClaimRequest, TsnClaimRequestStatus, TsnIntentStatus, TsnMempoolClaimRequest, TsnMempoolIntent, TsnIntentWorkItem, TsnRecoveryStatus, TsnEpochChallenge, TsnRecoveryWorkItem, TsnTinOperationRecord, TsnWorkItem, ProofOfPaymentRequest, PruLifecycleMutation } from "./contracts.js";
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
    listPendingRecoveryWork(operatorPubkey: string, limit?: number): Promise<TsnRecoveryWorkItem[]>;
    claimRecoveryLease(id: string, operatorPubkey: string): Promise<TsnRecoveryWorkItem>;
    updateRecoveryStatus(id: string, operatorPubkey: string, status: TsnRecoveryStatus, patch?: Partial<TsnRecoveryWorkItem>): Promise<TsnRecoveryWorkItem | null>;
    publishEpochChallenge(challenge: Omit<TsnEpochChallenge, "id" | "status" | "postedAt" | "updatedAt"> & {
        id?: string;
        status?: TsnEpochChallenge["status"];
    }): Promise<TsnEpochChallenge>;
    listOpenEpochChallenges(limit?: number): Promise<TsnEpochChallenge[]>;
    updateEpochChallengeStatus(id: string, status: TsnEpochChallenge["status"], patch?: Partial<TsnEpochChallenge>): Promise<TsnEpochChallenge | null>;
    listTinVerificationWork(limit?: number): Promise<TsnTinOperationRecord[]>;
    listTinFeeWork(operatorPubkey: string, limit?: number): Promise<TsnTinOperationRecord[]>;
    listTinRegistryWork(operatorPubkey: string, limit?: number): Promise<TsnTinOperationRecord[]>;
    markTinOperationVerified(id: string, crankerPubkey: string): Promise<TsnTinOperationRecord | null>;
    markTinOperationFeeCommitted(id: string, crankerPubkey: string, feeCommitmentTx?: string | null): Promise<TsnTinOperationRecord | null>;
    markTinOperationSubmitted(id: string, crankerPubkey: string, txSignature: string): Promise<TsnTinOperationRecord | null>;
    markTinOperationFinalized(id: string, txSignature?: string | null): Promise<TsnTinOperationRecord | null>;
    markTinOperationFailed(id: string, reason: string): Promise<TsnTinOperationRecord | null>;
    recordPruLifecycleMutation(intentId: string, mutation: PruLifecycleMutation): Promise<TsnMempoolIntent | null>;
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
    listPendingRecoveryWork(operatorPubkey: string, limit?: number): Promise<TsnRecoveryWorkItem[]>;
    claimRecoveryLease(id: string, operatorPubkey: string): Promise<TsnRecoveryWorkItem>;
    updateRecoveryStatus(id: string, operatorPubkey: string, status: TsnRecoveryStatus, patch?: Partial<TsnRecoveryWorkItem>): Promise<TsnRecoveryWorkItem | null>;
    publishEpochChallenge(challenge: Omit<TsnEpochChallenge, "id" | "status" | "postedAt" | "updatedAt"> & {
        id?: string;
        status?: TsnEpochChallenge["status"];
    }): Promise<TsnEpochChallenge>;
    listOpenEpochChallenges(limit?: number): Promise<TsnEpochChallenge[]>;
    updateEpochChallengeStatus(id: string, status: TsnEpochChallenge["status"], patch?: Partial<TsnEpochChallenge>): Promise<TsnEpochChallenge | null>;
    listTinVerificationWork(limit?: number): Promise<TsnTinOperationRecord[]>;
    listTinFeeWork(operatorPubkey: string, limit?: number): Promise<TsnTinOperationRecord[]>;
    listTinRegistryWork(operatorPubkey: string, limit?: number): Promise<TsnTinOperationRecord[]>;
    private patchTinOperation;
    markTinOperationVerified(id: string, crankerPubkey: string): Promise<TsnTinOperationRecord | null>;
    markTinOperationFeeCommitted(id: string, crankerPubkey: string, feeCommitmentTx?: string | null): Promise<TsnTinOperationRecord | null>;
    markTinOperationFeeCommittedPlaceholder(id: string, crankerPubkey: string, feeCommitmentTx?: string | null): Promise<TsnTinOperationRecord | null>;
    markTinOperationSubmitted(id: string, crankerPubkey: string, txSignature: string): Promise<TsnTinOperationRecord | null>;
    markTinOperationFinalized(id: string, txSignature?: string | null): Promise<TsnTinOperationRecord | null>;
    markTinOperationFailed(id: string, reason: string): Promise<TsnTinOperationRecord | null>;
    recordPruLifecycleMutation(intentId: string, mutation: PruLifecycleMutation): Promise<TsnMempoolIntent | null>;
}
export declare class HttpTsnMempool implements TsnMempool {
    private readonly client;
    constructor(baseUrl?: string | undefined, apiKey?: string | undefined);
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
    listPendingRecoveryWork(operatorPubkey: string, limit?: number): Promise<TsnRecoveryWorkItem[]>;
    claimRecoveryLease(id: string, operatorPubkey: string): Promise<TsnRecoveryWorkItem>;
    updateRecoveryStatus(id: string, operatorPubkey: string, status: TsnRecoveryStatus, patch?: Partial<TsnRecoveryWorkItem>): Promise<TsnRecoveryWorkItem>;
    publishEpochChallenge(challenge: Omit<TsnEpochChallenge, "id" | "status" | "postedAt" | "updatedAt"> & {
        id?: string;
        status?: TsnEpochChallenge["status"];
    }): Promise<TsnEpochChallenge>;
    listOpenEpochChallenges(limit?: number): Promise<TsnEpochChallenge[]>;
    updateEpochChallengeStatus(id: string, status: TsnEpochChallenge["status"], patch?: Partial<TsnEpochChallenge>): Promise<TsnEpochChallenge>;
    listTinVerificationWork(limit?: number): Promise<TsnTinOperationRecord[]>;
    listTinFeeWork(operatorPubkey: string, limit?: number): Promise<TsnTinOperationRecord[]>;
    listTinRegistryWork(operatorPubkey: string, limit?: number): Promise<TsnTinOperationRecord[]>;
    markTinOperationVerified(id: string, crankerPubkey: string): Promise<TsnTinOperationRecord>;
    markTinOperationFeeCommitted(id: string, crankerPubkey: string, feeCommitmentTx?: string | null): Promise<TsnTinOperationRecord>;
    markTinOperationSubmitted(id: string, crankerPubkey: string, txSignature: string): Promise<TsnTinOperationRecord>;
    markTinOperationFinalized(id: string, txSignature?: string | null): Promise<TsnTinOperationRecord>;
    markTinOperationFailed(id: string, reason: string): Promise<TsnTinOperationRecord>;
    recordPruLifecycleMutation(intentId: string, mutation: PruLifecycleMutation): Promise<TsnMempoolIntent>;
}
//# sourceMappingURL=mempool.d.ts.map