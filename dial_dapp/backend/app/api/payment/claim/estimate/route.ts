export const runtime = "nodejs";

import { toErrorResponse, ok } from "@/app/lib/http";

/**
 * Estimate claim fee via TSN
 */
export async function POST(request: Request) {
  try {
    return ok({
      claimFeeAmountUi: 0.01,
      claimFeeAmountUsd: 0.01,
      message: "Query TSN for estimate",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
