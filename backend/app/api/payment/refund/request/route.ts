export const runtime = "nodejs";

import { requireAuthenticatedUser } from "@/app/lib/auth";
import { ok, toErrorResponse } from "@/app/lib/http";
import { requestPaymentRefundSchema } from "@/app/lib/validation";
import { requestPaymentRefund } from "@/app/services/payments";

export async function POST(request: Request) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const body = await request.json();
    const payload = requestPaymentRefundSchema.parse(body);
    const result = await requestPaymentRefund({
      ...payload,
      authUser,
    });

    return ok({
      paymentId: result.payment.id,
      status: result.payment.status,
      refundClaimAvailableAt: result.refundClaimAvailableAt,
      refundReceiverPublicKey: result.payment.refund_receiver_pubkey ?? null,
      refundEphemeralPublicKey: result.payment.refund_ephemeral_pubkey ?? null,
      serializedTransaction:
        "serializedTransaction" in result.blockchain ? result.blockchain.serializedTransaction : null,
      rpcUrl: "rpcUrl" in result.blockchain ? result.blockchain.rpcUrl : null,
      programId: "programId" in result.blockchain ? result.blockchain.programId : null,
      preview: "preview" in result.blockchain ? result.blockchain.preview : null,
      blockchainSignature: result.blockchain.signature,
      blockchainMode: result.blockchain.mode,
      requiresClientSignature: "requiresClientSignature" in result ? result.requiresClientSignature : false,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
