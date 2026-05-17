export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { CACHE_TAGS, CACHE_TTL_SECONDS, cachedQuery } from "@/app/lib/cache";
import { ok } from "@/app/lib/http";
import { sanitizePaymentForViewer } from "@/app/services/payment-views";
import { listPaymentHistoryForUser } from "@/app/services/payments";
import { enrichPaymentsWithUsd } from "@/app/services/pricing";

const getCachedPaymentHistory = cachedQuery(
  "payment-history-v1",
  async (userId: string, phoneNumber: string, limit: number) => {
    const authUser = { id: userId, phoneNumber };
    const payments = await listPaymentHistoryForUser(authUser, limit);
    const enrichedPayments = await enrichPaymentsWithUsd(payments);
    return enrichedPayments.map((payment) => sanitizePaymentForViewer(payment, authUser));
  },
  {
    revalidate: CACHE_TTL_SECONDS.payments,
    tags: [CACHE_TAGS.payments],
  },
);

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 20;

    return ok({
      payments: await getCachedPaymentHistory(authUser.id, authUser.phoneNumber, safeLimit)
    });
  });
}
