export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { fail, ok } from "@/app/lib/http";
import { getPaymentDetailForViewer } from "@/app/services/payment-views";
import { env } from "@/app/lib/env";

/**
 * Return full payment detail for the authenticated viewer.
 * Includes `payment` so lightweight pollers can read status directly.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const { paymentId } = await params;

    if (!paymentId) {
      return fail("Missing payment id", 400);
    }

    try {
      const detail = await getPaymentDetailForViewer(
        authUser,
        paymentId,
        env.APP_BASE_URL,
      );
      return ok(detail);
    } catch (error) {
      if (error instanceof Error && /not found/i.test(error.message)) {
        return fail("Payment not found", 404);
      }
      if (error instanceof Error && /not allowed/i.test(error.message)) {
        return fail("You are not allowed to view this payment", 403);
      }
      throw error;
    }
  });
}
