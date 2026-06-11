export type TsnIntentStatus = "pending" | "escrowed" | "onchain" | "claimed" | "executed" | "settled" | "expired" | "failed" | "canceled" | "reverted";
export type TsnClaimRequestStatus = "pending" | "processing" | "completed" | "failed" | "canceled";
export type TsnLeaseStatus = "active" | "completed" | "expired" | "canceled";
export type TsnRecoveryJobStatus = "open" | "leased" | "completed" | "failed" | "canceled";
export type TsnUiStage = "intent_pending" | "claim_requested" | "escrowed" | "lease_claimed" | "cranker_paid" | "epoch_settled" | "reverted";
export type PaymentIntentStatus = "pending" | "escrowed" | "onchain" | "claimed" | "executed" | "settled" | "expired" | "failed" | "canceled" | "reverted";
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
    escrow_tx_sig: string | null;
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
    senderWallet?: string | null;
    senderAuthorizationMessage?: string | null;
    senderAuthorizationSignature?: string | null;
    senderAuthorizationNonce?: string | null;
    senderAuthorizationIssuedAt?: string | null;
    senderAuthorizationExpiresAt?: string | null;
    senderFeeAmount?: number | null;
    senderSignedSettlementTransaction?: string | null;
    senderSignedSettlementFeePayer?: string | null;
    senderSettlementMode?: "sponsored_sender_cosigned" | string | null;
    senderTokenAccount?: string | null;
    settlementVault?: string | null;
    settlementTokenAccount?: string | null;
    settlementPaymentIntentId?: string | null;
    intentSeedHash: string;
    recipientHash: string;
    tokenMintAddress: string;
    amount: number;
    recipientAmount?: number;
    source?: string;
    epoch?: number;
    encryptedSettlementToken?: string;
    settlementTokenCommitmentHash?: string;
    commitmentRegistryEntry?: CommitmentRegistryEntry;
};
export type CommitmentRegistryEntry = {
    transferId: string;
    encryptedSettlementToken: string;
    commitmentHash: string;
    timestamp: string;
    epoch: number;
    recoverable: boolean;
    intentVerifierPubkey?: string | null;
    settlementCommitmentHash?: string | null;
    settlementProofTx?: string | null;
    otdtHash?: string | null;
    recoveryProofTx?: string | null;
    updatedAt?: string;
};
export type ClaimPointLedgerEntry = {
    crankerPubkey: string;
    earned: number;
    available: number;
    leased: number;
    lastIntentWorkAt?: string | null;
};
export type ClaimLeaseRecord = {
    id: string;
    transferId: string;
    crankerPubkey: string;
    status: TsnLeaseStatus;
    pointsSpent: number;
    otdtHash?: string | null;
    issuedAt: string;
    expiresAt: string;
    completedAt?: string | null;
};
export type RecoveryQueueEntry = {
    id: string;
    transferId: string;
    epoch: number;
    recoverableAmount: number;
    vaultSource: string;
    recoveryReward: number;
    priorityScore: number;
    status: TsnRecoveryJobStatus;
    leasedByCrankerPubkey?: string | null;
    leaseExpiresAt?: string | null;
    proofTx?: string | null;
    createdAt: string;
    updatedAt: string;
};
export type LiquidityMetrics = {
    activeLiquidity: number;
    pendingIntentAmount: number;
    vaultBalance: number;
    settlementVelocity: number;
    liquidityConsumptionRate: number;
    lowLiquidityThreshold: number;
    updatedAt: string;
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
    assignedCrankerPubkey?: string | null;
    escrowTxSig?: string | null;
    claimTxSig?: string | null;
    proofTxSig?: string | null;
    settlementResolution?: "completed" | "reverted" | null;
    settlementReason?: string | null;
    claimLeaseId?: string | null;
    postedAt: string;
    updatedAt: string;
};
export type TsnMempoolClaimRequest = RequestClaimRequest & {
    id: string;
    status: TsnClaimRequestStatus;
    settlementReason?: string | null;
    claimLeaseId?: string | null;
    postedAt: string;
    updatedAt: string;
};
export type TsnWorkItem = {
    intent: TsnMempoolIntent;
    claimRequest: TsnMempoolClaimRequest;
};
export type TsnIntentWorkItem = {
    intent: TsnMempoolIntent;
};
export type ProofOfPaymentRequest = {
    intent_id: string;
    timestamp: string;
    cranker_pubkey: string;
    proof_tx: string;
    encrypted_payload?: string | null;
    settlement_commitment_hash?: string | null;
    otdt_hash?: string | null;
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
    senderWallet?: string | null;
    senderAuthorizationMessage?: string | null;
    senderAuthorizationSignature?: string | null;
    senderAuthorizationNonce?: string | null;
    senderAuthorizationIssuedAt?: string | null;
    senderAuthorizationExpiresAt?: string | null;
    senderFeeAmount?: number | null;
    senderSignedSettlementTransaction?: string | null;
    senderSignedSettlementFeePayer?: string | null;
    senderSettlementMode?: "sponsored_sender_cosigned" | string | null;
    senderTokenAccount?: string | null;
    settlementVault?: string | null;
    settlementTokenAccount?: string | null;
    settlementPaymentIntentId?: string | null;
    recipientHash: string;
    tokenMintAddress: string;
    amount: number;
    source?: string;
    epoch?: number;
    encryptedSettlementToken?: string;
    settlementTokenCommitmentHash?: string;
}): CreateIntentRequest;
export declare function buildRequestClaimRequest(params: RequestClaimRequest): RequestClaimRequest;
export declare function computeTsnUiStage(intent: IntentState, claimRequest: ClaimRequestState): TsnUiStage;
//# sourceMappingURL=contracts.d.ts.map