export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { ok, toErrorResponse } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";
import { estimateClaimFeeSchema } from "@/app/lib/validation";
import { estimatePaymentClaim } from "@/app/services/payments";

export async function POST(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const body = await request.json();
    const payload = estimateClaimFeeSchema.parse(body);
    const result = await estimatePaymentClaim({
      ...payload,
      authUser,
    });

    return ok({
      paymentId: result.payment.id,
      settlementWalletAddress: result.settlementWalletAddress,
      paymentReceiverPublicKey: result.paymentReceiverPublicKey,
      estimate: result.estimate,
    });
  } catch (error) {
    logger.error("api.payment.claim_estimate.failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return toErrorResponse(error);
  }
}
