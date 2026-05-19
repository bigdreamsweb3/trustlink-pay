export const runtime = "nodejs";

import { toErrorResponse, ok } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";
import { env } from "@/app/lib/env";

/**
 * List pending payments from TSN
 */
export async function GET(request: Request) {
  try {
    if (!env.TSN_ENABLED) {
      return ok({ payments: [], totalPendingUsd: 0 });
    }
    
    // TODO: Query TSN for pending payments
    logger.info("payment.pending.deferred_to_tsn");
    
    return ok({
      payments: [],
      totalPendingUsd: 0,
      message: "Query TSN for pending payments",
    });
  } catch (error) {
    logger.error("api.payment.pending.failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return toErrorResponse(error);
  }
}
