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
      serializedTransaction:
        "serializedTransaction" in result.blockchain ? result.blockchain.serializedTransaction : null,
      rpcUrl: "rpcUrl" in result.blockchain ? result.blockchain.rpcUrl : null,
      programId: "programId" in result.blockchain ? result.blockchain.programId : null,
      preview: "preview" in result.blockchain ? result.blockchain.preview : null,
      claimFeeAmount: result.payment?.claim_fee_amount ?? null,
      tokenSymbol: result.payment?.token_symbol ?? null,
      netAmount:
        result.payment != null
          ? Math.max(Number(result.payment.amount) - Number(result.payment.claim_fee_amount ?? 0), 0)
          : null,
      blockchainSignature: result.blockchain.signature,
      blockchainMode: result.blockchain.mode,
      requiresClientSignature: "requiresClientSignature" in result ? result.requiresClientSignature : false,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
