export const runtime = "nodejs";

import { toErrorResponse, ok } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";
import { env } from "@/app/lib/env";

/**
 * Get payment details from TSN
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const { paymentId } = await params;
    
    if (!env.TSN_ENABLED) {
      return ok({ payment: null, error: "TSN not enabled" });
    }
    
    // TODO: Query TSN for payment status
    logger.info("payment.get.deferred_to_tsn", { paymentId });
    
    return ok({
      payment: null,
      message: "Query TSN for payment status",
    });
  } catch (error) {
    logger.error("api.payment.get.failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return toErrorResponse(error);
  }
}
