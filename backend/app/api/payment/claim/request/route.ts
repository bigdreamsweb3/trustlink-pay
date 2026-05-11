export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { requireAuthenticatedUser } from "@/app/lib/auth";
import { createClaimRequestSchema } from "@/app/lib/validation";
import { requestPaymentClaimViaTsn } from "@/app/services/tsn";

export async function POST(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const body = await request.json();
    const payload = createClaimRequestSchema.parse(body);

    const result = await requestPaymentClaimViaTsn({
      authUser,
      paymentId: payload.paymentId,
      pin: payload.pin,
      walletAddress: payload.walletAddress,
      receiverWalletId: payload.receiverWalletId,
      derivedPaymentReceiverPublicKey: payload.derivedPaymentReceiverPublicKey,
      privacySpendSignature: payload.privacySpendSignature,
      autoclaim: payload.autoclaim,
    });

    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
