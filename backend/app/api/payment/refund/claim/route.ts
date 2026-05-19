export const runtime = "nodejs";

import { toErrorResponse, ok } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";

/**
 * Claim refund via TSN
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { paymentId } = body;
    
    // TODO: Submit refund claim to TSN
    logger.info("payment.refund.claim.deferred_to_tsn", { paymentId });
    
    return ok({
      message: "Refund claim submitted to TSN",
      status: "processing",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
