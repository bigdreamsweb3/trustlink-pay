export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { resolveAppBaseUrlFromRequest } from "@/app/lib/app-url";
import { CACHE_TAGS, CACHE_TTL_SECONDS, cachedQuery } from "@/app/lib/cache";
import { fail, ok, toErrorResponse } from "@/app/lib/http";
import { getPaymentDetailForViewer } from "@/app/services/payment-views";

const getCachedPaymentDetail = cachedQuery(
  "payment-detail-v1",
  (userId: string, phoneNumber: string, paymentId: string, appBaseUrl: string | null) =>
    getPaymentDetailForViewer(
      { id: userId, phoneNumber },
      paymentId,
      appBaseUrl,
    ),
  {
    revalidate: CACHE_TTL_SECONDS.payments,
    tags: [CACHE_TAGS.payments],
  },
);

export async function GET(
  request: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const { paymentId } = await context.params;
    const detail = await getCachedPaymentDetail(
      authUser.id,
      authUser.phoneNumber,
      paymentId,
      resolveAppBaseUrlFromRequest(request),
    );

    return ok(detail);
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}
