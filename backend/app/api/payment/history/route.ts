export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { sanitizePaymentForViewer } from "@/app/services/payment-views";
import { listPaymentHistoryForUser } from "@/app/services/payments";
import { enrichPaymentsWithUsd } from "@/app/services/pricing";

export async function GET(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const payments = await listPaymentHistoryForUser(authUser, Number.isFinite(limit) ? limit : 20);
    const enrichedPayments = await enrichPaymentsWithUsd(payments);
    const safePayments = enrichedPayments.map((payment) => sanitizePaymentForViewer(payment, authUser));

    return ok({
      payments: safePayments
    });
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}
