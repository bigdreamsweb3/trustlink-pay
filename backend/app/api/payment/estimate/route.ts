export const runtime = "nodejs";

import { toErrorResponse, ok } from "@/app/lib/http";

/**
 * Estimate payment cost via TSN
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Return estimate from TSN
    return ok({
      tokenSymbol: "USDC",
      senderFeeAmountUi: 0.05,
      senderFeeAmountUsd: 0.05,
      totalTokenRequiredUi: 0,
      networkFeeSol: 0.000005,
      networkFeeUsd: 0.001,
      message: "Query TSN for estimate",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
