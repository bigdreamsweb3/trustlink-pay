export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { getPaymentDetailForViewer } from "@/app/services/payment-views";

export async function GET(
  request: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const { paymentId } = await context.params;
    const detail = await getPaymentDetailForViewer(authUser, paymentId);

    return ok(detail);
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}
