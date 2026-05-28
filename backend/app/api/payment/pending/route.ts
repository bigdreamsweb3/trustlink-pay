export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { ok } from "@/app/lib/http";
import { listLockedPaymentsForUser } from "@/app/services/payments/read";

export async function GET(request: Request) {
  return withAuthenticatedRoute(request, async (authUser) => {
    const payments = await listLockedPaymentsForUser(authUser.phoneNumber);
    const totalPendingUsd = Number(
      payments
        .reduce((sum, payment) => sum + Number(payment.amount_usd ?? 0), 0)
        .toFixed(2),
    );

    const byTokenMap = new Map<string, { amount: number; amountUsd: number }>();
    for (const payment of payments) {
      const key = payment.token_symbol;
      const current = byTokenMap.get(key) ?? { amount: 0, amountUsd: 0 };
      current.amount += Number(payment.amount ?? 0);
      current.amountUsd += Number(payment.amount_usd ?? 0);
      byTokenMap.set(key, current);
    }

    const summary = {
      claimableCount: payments.length,
      totalPendingUsd,
      byToken: Array.from(byTokenMap.entries()).map(([tokenSymbol, value]) => ({
        tokenSymbol,
        amount: Number(value.amount.toFixed(6)),
        amountUsd: Number(value.amountUsd.toFixed(2)),
      })),
    };

    return ok({
      payments,
      totalPendingUsd,
      summary,
    });
  });
}
