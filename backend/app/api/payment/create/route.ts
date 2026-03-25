export const runtime = "nodejs";

import { createPaymentSchema } from "@/app/lib/validation";
import { ok, toErrorResponse } from "@/app/lib/http";
import { createPayment } from "@/app/services/payments";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = createPaymentSchema.parse(body);

    const result = await createPayment(payload);

    return ok(
      {
        paymentId: result.payment.id,
        status: result.payment.status,
        referenceCode: result.payment.reference_code,
        senderDisplayName: result.payment.sender_display_name_snapshot,
        senderHandle: result.payment.sender_handle_snapshot,
        escrowAccount: result.payment.escrow_account,
        blockchainSignature: result.blockchain.signature,
        depositAddress: result.payment.escrow_account
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
