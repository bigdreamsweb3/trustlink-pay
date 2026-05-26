export const runtime = "nodejs";

import { toErrorResponse, ok } from "@/app/lib/http";
import { estimatePaymentSchema } from "@/app/lib/validation";

/**
 * Estimate payment cost via TSN
 */
export async function POST(request: Request) {
  try {
    const body = estimatePaymentSchema.parse(await request.json());
    const senderFeeAmountUi = 0.05;
    const networkFeeSol = 0.000005;
    const estimate = {
      tokenSymbol: "USDC",
      senderFeeAmountUi,
      senderFeeAmountUsd: 0.05,
      totalTokenRequiredUi: Number((body.amount + senderFeeAmountUi).toFixed(6)),
      networkFeeSol,
      networkFeeUsd: 0.001,
      message: "Query TSN for estimate",
    };
    return ok({ estimate });
  } catch (error) {
    return toErrorResponse(error);
  }
}
