export const runtime = "nodejs";

import { estimatePaymentSchema } from "@/app/lib/validation";
import { ok, toErrorResponse } from "@/app/lib/http";
import { estimatePaymentTransfer } from "@/app/services/payments";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = estimatePaymentSchema.parse(body);
    const result = await estimatePaymentTransfer(payload);

    return ok({
      paymentId: result.paymentId,
      estimate: result.estimate,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
