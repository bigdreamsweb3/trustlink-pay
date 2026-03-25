export const runtime = "nodejs";

import { findPaymentById } from "@/app/db/payments";
import { listWhatsAppWebhookEventsByPaymentId } from "@/app/db/whatsapp-webhook-events";
import { fail, ok, toErrorResponse } from "@/app/lib/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  try {
    const { paymentId } = await context.params;
    const payment = await findPaymentById(paymentId);

    if (!payment) {
      return fail("Payment not found", 404);
    }

    const webhookEvents = await listWhatsAppWebhookEventsByPaymentId(paymentId);

    return ok({
      payment,
      whatsapp: {
        notificationMessageId: payment.notification_message_id,
        events: webhookEvents
      },
      sender: {
        displayName: payment.sender_display_name_snapshot,
        handle: payment.sender_handle_snapshot,
        referenceCode: payment.reference_code
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
