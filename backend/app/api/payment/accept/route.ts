export const runtime = "nodejs";

import { acceptPaymentSchema } from "@/app/lib/validation";
import { requireAuthenticatedUser } from "@/app/lib/auth";
import { ok, toErrorResponse } from "@/app/lib/http";
import { acceptPayment } from "@/app/services/payments";

export async function POST(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const body = await request.json();
    const payload = acceptPaymentSchema.parse(body);

    const result = await acceptPayment({
      ...payload,
      authUser
    });

    return ok({
      paymentId: result.payment?.id,
      status: result.payment?.status,
      referenceCode: result.payment?.reference_code,
      walletAddress: result.user.wallet_address,
      blockchainSignature: result.blockchain.signature,
      blockchainMode: result.blockchain.mode
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
