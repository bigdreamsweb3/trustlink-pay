export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { CACHE_TAGS, CACHE_TTL_SECONDS, cachedQuery } from "@/app/lib/cache";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { sanitizePaymentForViewer } from "@/app/services/payment-views";
import { listLockedPaymentsForUser } from "@/app/services/payments";
import { enrichPaymentsWithUsd } from "@/app/services/pricing";

const getCachedPendingPayments = cachedQuery(
  "payment-pending-v1",
  async (userId: string, phoneNumber: string) => {
    const authUser = { id: userId, phoneNumber };
    const payments = await listLockedPaymentsForUser(phoneNumber);
    const enrichedPayments = await enrichPaymentsWithUsd(payments);
    const safePayments = enrichedPayments.map((payment) => sanitizePaymentForViewer(payment, authUser));
    const totalPendingUsd = Number(
      enrichedPayments.reduce((sum, payment) => sum + (payment.amount_usd ?? 0), 0).toFixed(2)
    );
    const byTokenMap = new Map<string, { tokenSymbol: string; amount: number; amountUsd: number | null }>();

    for (const payment of enrichedPayments) {
      const tokenSymbol = payment.token_symbol;
      const amount = Number(payment.amount);
      const amountUsd = payment.amount_usd ?? null;
      const existing = byTokenMap.get(tokenSymbol);

      if (existing) {
        existing.amount = Number((existing.amount + amount).toFixed(6));
        existing.amountUsd =
          existing.amountUsd != null || amountUsd != null
            ? Number(((existing.amountUsd ?? 0) + (amountUsd ?? 0)).toFixed(2))
            : null;
        continue;
      }

      byTokenMap.set(tokenSymbol, {
        tokenSymbol,
        amount: Number(amount.toFixed(6)),
        amountUsd: amountUsd != null ? Number(amountUsd.toFixed(2)) : null,
      });
    }

    return {
      payments: safePayments,
      totalPendingUsd,
      summary: {
        claimableCount: enrichedPayments.length,
        totalPendingUsd,
        byToken: Array.from(byTokenMap.values()),
      },
    };
  },
  {
    revalidate: CACHE_TTL_SECONDS.payments,
    tags: [CACHE_TAGS.payments],
  },
);

export async function GET(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    return ok(await getCachedPendingPayments(authUser.id, authUser.phoneNumber));
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}
