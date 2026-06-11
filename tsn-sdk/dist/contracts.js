import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
export function sha256Hex(input) {
    return bytesToHex(sha256(utf8ToBytes(input)));
}
export function buildCreateIntentRequest(params) {
    return {
        paymentId: params.paymentId,
        underlyingPayment: params.underlyingPayment ?? null,
        senderWallet: params.senderWallet ?? null,
        senderAuthorizationMessage: params.senderAuthorizationMessage ?? null,
        senderAuthorizationSignature: params.senderAuthorizationSignature ?? null,
        senderAuthorizationNonce: params.senderAuthorizationNonce ?? null,
        senderAuthorizationIssuedAt: params.senderAuthorizationIssuedAt ?? null,
        senderAuthorizationExpiresAt: params.senderAuthorizationExpiresAt ?? null,
        senderFeeAmount: params.senderFeeAmount ?? null,
        senderSignedSettlementTransaction: params.senderSignedSettlementTransaction ?? null,
        senderSignedSettlementFeePayer: params.senderSignedSettlementFeePayer ?? null,
        senderSettlementMode: params.senderSettlementMode ?? null,
        senderTokenAccount: params.senderTokenAccount ?? null,
        settlementVault: params.settlementVault ?? null,
        settlementTokenAccount: params.settlementTokenAccount ?? null,
        settlementPaymentIntentId: params.settlementPaymentIntentId ?? null,
        intentSeedHash: sha256Hex(params.paymentId),
        recipientHash: params.recipientHash,
        tokenMintAddress: params.tokenMintAddress,
        amount: params.amount,
        source: params.source,
        epoch: params.epoch,
        encryptedSettlementToken: params.encryptedSettlementToken,
        settlementTokenCommitmentHash: params.settlementTokenCommitmentHash,
    };
}
export function buildRequestClaimRequest(params) {
    return params;
}
export function computeTsnUiStage(intent, claimRequest) {
    if (intent.status === "reverted" || intent.status === "failed" || intent.status === "canceled" || intent.status === "expired")
        return "reverted";
    if (claimRequest && (claimRequest.status === "failed" || claimRequest.status === "canceled"))
        return "reverted";
    if (intent.status === "settled")
        return "epoch_settled";
    if (intent.status === "executed")
        return "cranker_paid";
    if (intent.status === "claimed")
        return "lease_claimed";
    if (intent.status === "escrowed" || intent.status === "onchain")
        return "escrowed";
    if (intent.status === "pending")
        return "intent_pending";
    if (claimRequest && (claimRequest.status === "pending" || claimRequest.status === "processing")) {
        return "claim_requested";
    }
    return "intent_pending";
}
