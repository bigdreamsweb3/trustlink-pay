export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { ok, toErrorResponse } from "@/app/lib/http";
import { claimPaymentRefundSchema } from "@/app/lib/validation";
import { claimPaymentRefund } from "@/app/services/payments";

export async function POST(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const body = await request.json();
    const payload = claimPaymentRefundSchema.parse(body);
    const result = await claimPaymentRefund({
      ...payload,
      authUser,
    });

    return ok({
      paymentId: result.payment.id,
      status: result.payment.status,
      walletAddress: result.walletAddress,
      serializedTransaction:
        "serializedTransaction" in result.blockchain ? result.blockchain.serializedTransaction : null,
      rpcUrl: "rpcUrl" in result.blockchain ? result.blockchain.rpcUrl : null,
      programId: "programId" in result.blockchain ? result.blockchain.programId : null,
      preview: "preview" in result.blockchain ? result.blockchain.preview : null,
      refundReleaseSignature: result.payment.refund_release_signature ?? null,
      blockchainSignature: result.blockchain.signature,
      blockchainMode: result.blockchain.mode,
      requiresClientSignature: "requiresClientSignature" in result ? result.requiresClientSignature : false,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
