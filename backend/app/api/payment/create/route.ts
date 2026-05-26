export const runtime = "nodejs";
import { randomUUID } from "node:crypto";

import { toErrorResponse, ok } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";
import { env } from "@/app/lib/env";
import { findUserByPhoneNumber } from "@/app/db/users";
import { findPaymentById } from "@/app/db/payments";
import { createPaymentRecord } from "@/app/db/payments-write";
import { getWalletSupportedTokenBalance } from "@/app/blockchain/solana-core";
import { requestOnboardedRecipientSettlementViaTsn } from "@/app/services/tsn";
import { sha256 } from "@/app/utils/hash";
import { generatePaymentReference } from "@/app/utils/reference";
import { verifyAuthorizedTsnPaymentRequest } from "@trustlink/tsn-sdk";

const SENDER_AUTHORIZATION_MAX_AGE_MS = 5 * 60 * 1000;

function tsnIdentityForUser(user: { trustlink_handle: string }) {
  return `trustlink-handle:${user.trustlink_handle}`;
}

/**
 * NEW FLOW: Backend handles identity mapping, TSN handles payments
 * 
 * Frontend → Backend (validate identity) → TSN → Mempool → Cranker → On-chain
 * 
 * This endpoint forwards payment requests to TSN mempool.
 * For now returns a placeholder - full integration pending TIN implementation.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { paymentId, phoneNumber, senderPhoneNumber, amount, tokenMintAddress, senderWallet } = body;

    if (!env.TSN_ENABLED) {
      return toErrorResponse(new Error("TSN service not available"));
    }

    // Phase 2 compatibility for existing frontend flow.
    if (paymentId) {
      const existingPayment = await findPaymentById(paymentId);
      if (!existingPayment) {
        return toErrorResponse(new Error("Payment not found"));
      }
      return ok({
        paymentId: existingPayment.id,
        status: existingPayment.status,
        notificationStatus: existingPayment.notification_status,
        notificationSentAt: existingPayment.notification_sent_at,
        notificationDeliveredAt: existingPayment.notification_delivered_at,
        notificationReadAt: existingPayment.notification_read_at,
        notificationFailedAt: existingPayment.notification_failed_at,
        referenceCode: existingPayment.reference_code,
        senderDisplayName: existingPayment.sender_display_name_snapshot,
        senderHandle: existingPayment.sender_handle_snapshot,
        escrowAccount: existingPayment.escrow_account,
        blockchainSignature: null,
        blockchainMode: "tsn",
        depositAddress: existingPayment.escrow_vault_address,
        tokenSymbol: existingPayment.token_symbol,
        notificationRetrying: existingPayment.notification_status === "queued" || existingPayment.notification_status === "failed",
        notificationAttemptCount: existingPayment.notification_attempt_count ?? 0,
        manualInviteRequired: false,
        inviteShare: null,
      });
    }

    if (!phoneNumber || !senderPhoneNumber || !amount || !tokenMintAddress || !senderWallet) {
      return toErrorResponse(new Error("Missing required payment fields"));
    }

    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return toErrorResponse(new Error("Invalid payment amount"));
    }
    const senderFeeAmount = Number(body.senderFeeAmount ?? 0);
    const quotedTotalRequired = Number(body.totalTokenRequiredUi ?? paymentAmount + senderFeeAmount);
    const totalTokenRequiredUi =
      Number.isFinite(quotedTotalRequired) && quotedTotalRequired >= paymentAmount
        ? quotedTotalRequired
        : paymentAmount + (Number.isFinite(senderFeeAmount) && senderFeeAmount > 0 ? senderFeeAmount : 0);
    const sender = await findUserByPhoneNumber(senderPhoneNumber);
    if (!sender) return toErrorResponse(new Error("Sender must register identity first"));

    const receiver = await findUserByPhoneNumber(phoneNumber);
    if (!receiver) return toErrorResponse(new Error("Recipient must register identity first"));

    const senderAuthorizationIssuedAt = String(body.senderAuthorizationIssuedAt ?? "");
    const senderAuthorizationSignature = String(body.senderAuthorizationSignature ?? "");
    if (!senderAuthorizationIssuedAt || !senderAuthorizationSignature) {
      return toErrorResponse(new Error("Sender wallet authorization signature is required"));
    }
    const authorizationIssuedAtMs = Date.parse(senderAuthorizationIssuedAt);
    if (!Number.isFinite(authorizationIssuedAtMs) || Math.abs(Date.now() - authorizationIssuedAtMs) > SENDER_AUTHORIZATION_MAX_AGE_MS) {
      return toErrorResponse(new Error("Sender wallet authorization expired. Please review and sign again."));
    }
    await verifyAuthorizedTsnPaymentRequest({
      senderWallet,
      senderIdentity: tsnIdentityForUser(sender),
      receiverIdentity: tsnIdentityForUser(receiver),
      tokenMintAddress,
      amount: paymentAmount,
      senderFeeAmount: Number.isFinite(senderFeeAmount) && senderFeeAmount > 0 ? senderFeeAmount : 0,
      totalTokenRequiredUi,
      issuedAt: senderAuthorizationIssuedAt,
      signatureBase64: senderAuthorizationSignature,
      maxAgeMs: SENDER_AUTHORIZATION_MAX_AGE_MS,
      getSenderTokenBalance: async ({ senderWallet: walletAddress, tokenMintAddress }) =>
        getWalletSupportedTokenBalance({ walletAddress, tokenMintAddress }),
    });

    const payment = await createPaymentRecord({
      senderUserId: sender.id,
      senderWallet,
      senderPhoneIdentityPublicKey: sender.phone_identity_pubkey ?? null,
      senderDisplayNameSnapshot: sender.display_name,
      senderHandleSnapshot: sender.trustlink_handle,
      referenceCode: generatePaymentReference(),
      receiverPhone: receiver.phone_number,
      receiverPhoneHash: receiver.phone_hash ?? sha256(receiver.phone_number),
      receiverIdentityPublicKey: receiver.phone_identity_pubkey ?? "tsn-recipient",
      tokenSymbol: "USDC",
      tokenMintAddress,
      amount: paymentAmount,
      senderFeeAmount: Math.max(0, totalTokenRequiredUi - paymentAmount),
      escrowAccount: `tsn:${randomUUID()}`,
      escrowVaultAddress: senderWallet,
      senderAutoclaimEnabled: sender.receiver_autoclaim_enabled ?? false,
    });

    const tsnSettlement = await requestOnboardedRecipientSettlementViaTsn({ payment, receiver });

    logger.info("payment.create.tsn_work_created", {
      paymentId: payment.id,
      receiverPhone: receiver.phone_number,
      intentId: "intentId" in tsnSettlement ? tsnSettlement.intentId : null,
      claimRequestId: "claimRequestId" in tsnSettlement ? tsnSettlement.claimRequestId : null,
    });

    return ok({
      paymentId: payment.id,
      blockchainMode: "tsn",
      status: payment.status,
      referenceCode: payment.reference_code,
      senderDisplayName: payment.sender_display_name_snapshot,
      senderHandle: payment.sender_handle_snapshot,
      escrowAccount: payment.escrow_account,
      tokenSymbol: payment.token_symbol,
      notificationStatus: payment.notification_status,
      notificationSentAt: payment.notification_sent_at,
      notificationDeliveredAt: payment.notification_delivered_at,
      notificationReadAt: payment.notification_read_at,
      notificationFailedAt: payment.notification_failed_at,
      notificationRetrying: payment.notification_status === "queued" || payment.notification_status === "failed",
      notificationAttemptCount: payment.notification_attempt_count ?? 0,
      manualInviteRequired: false,
      inviteShare: null,
      tsnClaimRequestId: "claimRequestId" in tsnSettlement ? tsnSettlement.claimRequestId : null,
    });
  } catch (error) {
    logger.error("api.payment.create.failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return toErrorResponse(error);
  }
}
