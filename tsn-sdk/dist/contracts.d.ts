export type TsnIntentStatus = "pending" | "claimed" | "executed" | "settled" | "expired" | "failed" | "canceled" | "reverted";
export type TsnClaimRequestStatus = "pending" | "processing" | "completed" | "failed" | "canceled";
export type TsnUiStage = "intent_pending" | "claim_requested" | "lease_claimed" | "cranker_paid" | "epoch_settled" | "reverted";
export type PaymentIntentStatus = "pending" | "claimed" | "executed" | "settled" | "expired" | "reverted";
export type ClaimRequestStatus = "pending" | "processing" | "completed" | "canceled" | "failed";
export interface PaymentIntentRecord {
    id: string;
    payment_id: string;
    intent_seed_hash: string;
    recipient_hash: string;
    token_mint_address: string | null;
    amount: string;
    status: PaymentIntentStatus;
    assigned_cranker_pubkey: string | null;
    lease_expiry_at: string | null;
    claim_tx_sig: string | null;
    proof_tx_sig: string | null;
    created_at: string;
}
export interface ClaimRequestRecord {
    id: string;
    payment_id: string;
    intent_id: string;
    recipient_hash: string;
    destination_wallet: string | null;
    autoclaim: boolean;
    status: ClaimRequestStatus;
    requested_at: string;
    updated_at: string;
}
export type CreateIntentRequest = {
    paymentId: string;
    underlyingPayment?: string | null;
    intentSeedHash: string;
    recipientHash: string;
    tokenMintAddress: string;
    amount: number;
    recipientAmount?: number;
    source?: string;
};
export type RequestClaimRequest = {
    paymentId: string;
    intentId: string;
    recipientHash: string;
    destinationWallet: string;
    autoclaim: boolean;
    source?: string;
};
export type TsnMempoolIntent = CreateIntentRequest & {
    id: string;
    status: TsnIntentStatus;
    settlementResolution?: "completed" | "reverted" | null;
    settlementReason?: string | null;
    postedAt: string;
    updatedAt: string;
};
export type TsnMempoolClaimRequest = RequestClaimRequest & {
    id: string;
    status: TsnClaimRequestStatus;
    settlementReason?: string | null;
    postedAt: string;
    updatedAt: string;
};
export type TsnWorkItem = {
    intent: TsnMempoolIntent;
    claimRequest: TsnMempoolClaimRequest;
};
export type ProofOfPaymentRequest = {
    intent_id: string;
    timestamp: string;
    cranker_pubkey: string;
    proof_tx: string;
    encrypted_payload?: string | null;
};
export type IntentState = {
    status: TsnIntentStatus;
};
export type ClaimRequestState = {
    status: TsnClaimRequestStatus;
} | null;
export declare function sha256Hex(input: string): string;
export declare function buildCreateIntentRequest(params: {
    paymentId: string;
    underlyingPayment?: string | null;
    recipientHash: string;
    tokenMintAddress: string;
    amount: number;
    source?: string;
}): CreateIntentRequest;
export declare function buildRequestClaimRequest(params: RequestClaimRequest): RequestClaimRequest;
export declare function computeTsnUiStage(intent: IntentState, claimRequest: ClaimRequestState): TsnUiStage;
//# sourceMappingURL=contracts.d.ts.map