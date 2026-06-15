export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { fail, ok } from "@/app/lib/http";
import { findPaymentById } from "@/app/db/payments";
import { findPaymentIntentByPaymentId } from "@/app/db/tsn";
import { refreshSinglePaymentIntentStatus, isTsnSettled } from "@/app/services/tsn";
import { enrichPaymentsWithTsnState } from "@/app/services/tsn";
import type { PaymentIntentStatus, ClaimRequestStatus } from "@trustlink/tsn-sdk";

export type RefreshStatusResponse = {
  paymentId: string;
  previousIntentStatus: PaymentIntentStatus | null | undefined;
  latestIntentStatus: PaymentIntentStatus | null | undefined;
  previousClaimStatus: ClaimRequestStatus | null | undefined;
  latestClaimStatus: ClaimRequestStatus | null | undefined;
  tsnQueried: boolean;
  dbUpdated: boolean;
  finalized: boolean;
  nextRefreshAfterMs: number | null;
  settlementComplete: boolean;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  return withAuthenticatedRoute(request, async () => {
    const { paymentId } = await params;

    if (!paymentId) {
      return fail("Missing payment id", 400);
    }

    const payment = await findPaymentById(paymentId);
    if (!payment) {
      return fail("Payment not found", 404);
    }

    // Check TSN intent exists
    const intent = await findPaymentIntentByPaymentId(paymentId);
    if (!intent) {
      return ok({
        paymentId,
        previousIntentStatus: null,
        latestIntentStatus: null,
        previousClaimStatus: null,
        latestClaimStatus: null,
        tsnQueried: false,
        dbUpdated: false,
        finalized: false,
        nextRefreshAfterMs: null,
        settlementComplete: false,
      } satisfies RefreshStatusResponse);
    }

    const result = await refreshSinglePaymentIntentStatus(paymentId);

    // Recompute whether settlement is complete using enriched state
    const enriched = await enrichPaymentsWithTsnState([payment]);
    const settlementComplete = isTsnSettled(enriched[0]);

    return ok({
      paymentId,
      previousIntentStatus: result.previousIntentStatus,
      latestIntentStatus: result.latestIntentStatus,
      previousClaimStatus: result.previousClaimStatus,
      latestClaimStatus: result.latestClaimStatus,
      tsnQueried: result.tsnQueried,
      dbUpdated: result.dbUpdated,
      finalized: result.finalized,
      nextRefreshAfterMs: result.nextRefreshAfterMs,
      settlementComplete,
    } satisfies RefreshStatusResponse);
  });
}
