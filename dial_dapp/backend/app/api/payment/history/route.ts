export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { listPaymentHistoryForUser } from "@/app/services/payments/read";

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(100, Math.floor(limitRaw)))
      : 50;
    const payments = await listPaymentHistoryForUser(authUser, limit + 1);
    const hasMore = payments.length > limit;

    return ok({
      payments: hasMore ? payments.slice(0, limit) : payments,
      hasMore,
    });
  });
}
