export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { sanitizePaymentForViewer } from "@/app/services/payment-views";
import { listPaymentHistoryForUser } from "@/app/services/payments";
import { enrichPaymentsWithUsd } from "@/app/services/pricing";

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const payments = await listPaymentHistoryForUser(authUser, Number.isFinite(limit) ? limit : 20);
    const enrichedPayments = await enrichPaymentsWithUsd(payments);
    const safePayments = enrichedPayments.map((payment) => sanitizePaymentForViewer(payment, authUser));

    return ok({
      payments: safePayments
    });
  });
}
