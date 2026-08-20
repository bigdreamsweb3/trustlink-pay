export const runtime = "nodejs";

import { withAuthenticatedRoute } from "@/app/controllers/authenticated-route";
import { fail, ok } from "@/app/lib/http";
import { findPaymentById } from "@/app/db/payments";
import {
  findPaymentIntentByPaymentId,
  updatePaymentIntentStatus,
} from "@/app/db/tsn";
import { refreshSinglePaymentIntentStatus, isTsnSettled } from "@/app/services/tsn";
import { enrichPaymentsWithTsnState } from "@/app/services/tsn";
import type { PaymentIntentStatus } from "@trustlink/tsn-sdk";
import { traceApiHandler } from "../../../../../../utils/observability/tracer";

export type RefreshStatusResponse = {
  paymentId: string;
  previousIntentStatus: PaymentIntentStatus | null | undefined;
  latestIntentStatus: PaymentIntentStatus | null | undefined;
  tsnQueried: boolean;
  dbUpdated: boolean;
  finalized: boolean;
  nextRefreshAfterMs: number | null;
  settlementComplete: boolean;
};

async function postPaymentRefreshStatus(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  return withAuthenticatedRoute(request, async () => {
    const { paymentId } = await params;
    const body = await request.json().catch(() => ({})) as {
      observedTsnStatus?: {
        intentStatus?: PaymentIntentStatus;
        assignedCrankerPubkey?: string | null;
        fundingTxSig?: string | null;
        settlementTxSig?: string | null;
      };
    };

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
        tsnQueried: false,
        dbUpdated: false,
        finalized: false,
        nextRefreshAfterMs: null,
        settlementComplete: false,
      } satisfies RefreshStatusResponse);
    }

    if (body.observedTsnStatus?.intentStatus) {
      await updatePaymentIntentStatus({
        id: intent.id,
        status: body.observedTsnStatus.intentStatus,
        assignedCrankerPubkey: body.observedTsnStatus.assignedCrankerPubkey ?? null,
        fundingTxSig: body.observedTsnStatus.fundingTxSig ?? null,
        settlementTxSig: body.observedTsnStatus.settlementTxSig ?? null,
      });
      const enriched = await enrichPaymentsWithTsnState([payment]);
      return ok({
        paymentId,
        previousIntentStatus: intent.status,
        latestIntentStatus: body.observedTsnStatus.intentStatus,
        tsnQueried: false,
        dbUpdated: true,
        finalized:
          body.observedTsnStatus.intentStatus === "executed" ||
          body.observedTsnStatus.intentStatus === "settled" ||
          body.observedTsnStatus.intentStatus === "failed" ||
          body.observedTsnStatus.intentStatus === "canceled" ||
          body.observedTsnStatus.intentStatus === "expired" ||
          body.observedTsnStatus.intentStatus === "reverted",
        nextRefreshAfterMs: null,
        settlementComplete: isTsnSettled(enriched[0]),
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
      tsnQueried: result.tsnQueried,
      dbUpdated: result.dbUpdated,
      finalized: result.finalized,
      nextRefreshAfterMs: result.nextRefreshAfterMs,
      settlementComplete,
    } satisfies RefreshStatusResponse);
  });
}

export const POST = traceApiHandler(postPaymentRefreshStatus, {
  name: "/api/payment/[paymentId]/refresh-status",
  module: "backend/app/api/payment/[paymentId]/refresh-status/route.ts",
  includeReturn: false,
});
