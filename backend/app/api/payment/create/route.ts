export const runtime = "nodejs";
import { randomUUID } from "node:crypto";

import { toErrorResponse, ok } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";
import { env } from "@/app/lib/env";
import { findUserByPhoneNumber } from "@/app/db/users";
import { findPaymentById } from "@/app/db/payments";
import { createPaymentRecord } from "@/app/db/payments-write";
import { createTsnIntentForPayment } from "@/app/services/tsn";
import { sha256 } from "@/app/utils/hash";
import { generatePaymentReference } from "@/app/utils/reference";

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

    const sender = await findUserByPhoneNumber(senderPhoneNumber);
    if (!sender) return toErrorResponse(new Error("Sender must register identity first"));

    const receiver = await findUserByPhoneNumber(phoneNumber);
    if (!receiver) return toErrorResponse(new Error("Recipient must register identity first"));

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
      amount: Number(amount),
      escrowAccount: `tsn:${randomUUID()}`,
      escrowVaultAddress: senderWallet,
      senderAutoclaimEnabled: sender.receiver_autoclaim_enabled ?? false,
    });

    await createTsnIntentForPayment(payment);

    logger.info("payment.create.tsn_intent_created", { paymentId: payment.id, receiverPhone: receiver.phone_number });

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
    });
  } catch (error) {
    logger.error("api.payment.create.failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return toErrorResponse(error);
  }
}
