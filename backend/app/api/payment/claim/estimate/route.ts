export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { ok, toErrorResponse } from "@/app/lib/http";
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
      walletAddress: result.receiverWalletAddress,
      estimate: result.estimate,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
