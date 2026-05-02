export const runtime = "nodejs";

import { createPaymentSchema } from "@/app/lib/validation";
import { ok, toErrorResponse } from "@/app/lib/http";
import { resolveAppBaseUrlFromRequest } from "@/app/lib/app-url";
import { logger } from "@/app/lib/logger";
import { createPayment } from "@/app/services/payments";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = createPaymentSchema.parse(body);
    const appBaseUrl = resolveAppBaseUrlFromRequest(request);

    const result = await createPayment({ ...payload, appBaseUrl });
    const payment = result.payment;
    const notificationRetrying =
      payment != null &&
      !result.manualInviteRequired &&
      (payment.notification_status === "queued" || payment.notification_status === "failed");

    return ok(
      {
        paymentId: payment?.id ?? result.paymentId,
        status: payment?.status ?? null,
        notificationStatus: payment?.notification_status ?? null,
        notificationSentAt: payment?.notification_sent_at ?? null,
        notificationDeliveredAt: payment?.notification_delivered_at ?? null,
        notificationReadAt: payment?.notification_read_at ?? null,
        notificationFailedAt: payment?.notification_failed_at ?? null,
        referenceCode: payment?.reference_code ?? null,
        senderDisplayName: payment?.sender_display_name_snapshot ?? null,
        senderHandle: payment?.sender_handle_snapshot ?? null,
        paymentMode: payment?.payment_mode ?? null,
        receiverOnboarded: payment?.receiver_onboarded ?? null,
        phoneIdentityPublicKey:
          "phoneIdentityPublicKey" in result
            ? result.phoneIdentityPublicKey
            : payment?.phone_identity_pubkey ?? null,
        paymentReceiverPublicKey:
          "paymentReceiverPublicKey" in result
            ? result.paymentReceiverPublicKey
            : payment?.payment_receiver_pubkey ?? null,
        ephemeralPublicKey:
          "ephemeralPublicKey" in result
            ? result.ephemeralPublicKey
            : payment?.ephemeral_pubkey ?? null,
        escrowAccount: payment?.escrow_account ?? result.blockchain.escrowAccount,
        escrowVaultAddress: payment?.escrow_vault_address ?? result.blockchain.escrowVaultAddress ?? null,
        blockchainSignature: result.blockchain.signature,
        blockchainMode: result.blockchain.mode,
        serializedTransaction: "serializedTransaction" in result.blockchain ? result.blockchain.serializedTransaction : null,
        depositAddress: payment?.escrow_account ?? result.blockchain.escrowAccount,
        tokenSymbol: payment?.token_symbol ?? result.tokenSymbol ?? null,
        senderFeeAmount: payment?.sender_fee_amount ?? result.senderFeeAmount ?? null,
        claimFeeAmount: payment?.claim_fee_amount ?? null,
        totalTokenRequiredAmount: result.totalTokenRequiredAmount ?? null,
        expiryAt: payment?.expiry_at ?? ("expiryAt" in result.blockchain ? result.blockchain.expiryAt : null),
        notificationRetrying,
        notificationAttemptCount: payment?.notification_attempt_count ?? 0,
        manualInviteRequired: result.manualInviteRequired,
        inviteShare: result.inviteShare
      },
      { status: payment ? 201 : 200 }
    );
  } catch (error) {
    logger.error("api.payment.create.failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return toErrorResponse(error);
  }
}
