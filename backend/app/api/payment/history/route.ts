export const runtime = "nodejs";

import { toErrorResponse, ok } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";
import { env } from "@/app/lib/env";

/**
 * List payment history from TSN
 */
export async function GET(request: Request) {
  try {
    if (!env.TSN_ENABLED) {
      return ok({ payments: [], hasMore: false });
    }
    
    // TODO: Query TSN for payment history
    logger.info("payment.history.deferred_to_tsn");
    
    return ok({
      payments: [],
      hasMore: false,
      message: "Query TSN for history",
    });
  } catch (error) {
    logger.error("api.payment.history.failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return toErrorResponse(error);
  }
}
