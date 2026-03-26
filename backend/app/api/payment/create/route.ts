export const runtime = "nodejs";

import { createPaymentSchema } from "@/app/lib/validation";
import { ok, toErrorResponse } from "@/app/lib/http";
import { createPayment } from "@/app/services/payments";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = createPaymentSchema.parse(body);

    const result = await createPayment(payload);

    return ok(
      {
        paymentId: result.payment.id,
        status: result.payment.status,
        notificationStatus: result.payment.notification_status,
        notificationSentAt: result.payment.notification_sent_at,
        notificationDeliveredAt: result.payment.notification_delivered_at,
        notificationReadAt: result.payment.notification_read_at,
        notificationFailedAt: result.payment.notification_failed_at,
        referenceCode: result.payment.reference_code,
        senderDisplayName: result.payment.sender_display_name_snapshot,
        senderHandle: result.payment.sender_handle_snapshot,
        escrowAccount: result.payment.escrow_account,
        blockchainSignature: result.blockchain.signature,
        depositAddress: result.payment.escrow_account,
        notificationRetrying:
          !result.manualInviteRequired &&
          (result.payment.notification_status === "queued" || result.payment.notification_status === "failed"),
        notificationAttemptCount: result.payment.notification_attempt_count,
        manualInviteRequired: result.manualInviteRequired,
        inviteShare: result.inviteShare
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
