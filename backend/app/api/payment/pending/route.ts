export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { listPendingPaymentsForUser } from "@/app/services/payments";
import { enrichPaymentsWithUsd } from "@/app/services/pricing";

export async function GET(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const payments = await listPendingPaymentsForUser(authUser.phoneNumber);
    const enrichedPayments = await enrichPaymentsWithUsd(payments);
    const totalPendingUsd = Number(
      enrichedPayments.reduce((sum, payment) => sum + (payment.amount_usd ?? 0), 0).toFixed(2)
    );

    return ok({
      payments: enrichedPayments,
      totalPendingUsd
    });
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}
