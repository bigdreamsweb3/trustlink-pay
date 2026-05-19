export const runtime = "nodejs";

import { toErrorResponse, ok } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";
import { env } from "@/app/lib/env";

/**
 * Start payment claim via TSN
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { paymentId } = body;
    
    if (!env.TSN_ENABLED) {
      return toErrorResponse(new Error("TSN not enabled"));
    }
    
    // TODO: Submit claim request to TSN
    logger.info("payment.claim.start.deferred_to_tsn", { paymentId });
    
    return ok({
      message: "Claim request submitted to TSN",
      status: "processing",
    });
  } catch (error) {
    logger.error("api.payment.claim.start.failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return toErrorResponse(error);
  }
}
