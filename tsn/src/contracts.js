import { createHash } from "node:crypto";
export function sha256Hex(input) {
    return createHash("sha256").update(input).digest("hex");
}
export function sha256Bytes(input) {
    return createHash("sha256").update(input).digest();
}
export function buildCreateIntentRequest(params) {
    return {
        paymentId: params.paymentId,
        underlyingPayment: params.underlyingPayment ?? null,
        intentSeedHash: sha256Hex(params.paymentId),
        recipientHash: params.recipientHash,
        tokenMintAddress: params.tokenMintAddress,
        amount: params.amount,
        source: params.source,
    };
}
export function buildRequestClaimRequest(params) {
    return params;
}
export function computeTsnUiStage(intent, claimRequest) {
    if (intent.status === "reverted")
        return "reverted";
    if (intent.status === "settled")
        return "epoch_settled";
    if (intent.status === "executed")
        return "cranker_paid";
    if (intent.status === "claimed")
        return "lease_claimed";
    if (claimRequest && (claimRequest.status === "pending" || claimRequest.status === "processing")) {
        return "claim_requested";
    }
    return "intent_pending";
}
