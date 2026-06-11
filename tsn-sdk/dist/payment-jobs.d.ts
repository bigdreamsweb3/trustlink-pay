import { type CreateIntentRequest, type RequestClaimRequest } from "./contracts.js";
import type { TsnMempool } from "./mempool.js";
export type TsnSenderBalance = {
    balance: number;
    symbol?: string | null;
};
export declare function verifyAuthorizedTsnPaymentRequest(params: {
    senderWallet: string;
    senderIdentity: string;
    receiverIdentity: string;
    tokenMintAddress: string;
    amount: number;
    senderFeeAmount: number;
    totalTokenRequiredUi: number;
    issuedAt: string;
    nonce?: string;
    expiresAt?: string;
    signatureBase64: string;
    maxAgeMs?: number;
    getSenderTokenBalance?: (params: {
        senderWallet: string;
        tokenMintAddress: string;
    }) => Promise<TsnSenderBalance>;
}): Promise<{
    message: string;
}>;
export declare function createTsnPaymentMempoolJobs(params: {
    mempool: TsnMempool;
    paymentId: string;
    underlyingPayment?: string | null;
    recipientHash: string;
    tokenMintAddress: string;
    amount: number;
    senderFeeAmount?: number | null;
    recipientAmount?: number;
    destinationWallet: string;
    source?: string;
}): Promise<{
    claimRequestPayload: {
        intentId: string;
        paymentId: string;
        recipientHash: string;
        destinationWallet: string;
        autoclaim: boolean;
        source?: string;
    };
    intent: import("./contracts.js").TsnMempoolIntent;
    claimRequest: import("./contracts.js").TsnMempoolClaimRequest;
    intentRequest: CreateIntentRequest;
}>;
export declare function prepareTsnPaymentMempoolJobRequests(params: {
    paymentId: string;
    underlyingPayment?: string | null;
    recipientHash: string;
    tokenMintAddress: string;
    amount: number;
    senderFeeAmount?: number | null;
    recipientAmount?: number;
    destinationWallet: string;
    source?: string;
}): {
    intentRequest: CreateIntentRequest;
    claimRequestPayload: RequestClaimRequest;
};
//# sourceMappingURL=payment-jobs.d.ts.map