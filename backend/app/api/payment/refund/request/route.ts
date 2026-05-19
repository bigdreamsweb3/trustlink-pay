export const runtime = "nodejs";

import { toErrorResponse, ok } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";

/**
 * Request refund via TSN
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { paymentId } = body;
    
    // TODO: Submit refund request to TSN
    logger.info("payment.refund.request.deferred_to_tsn", { paymentId });
    
    return ok({
      message: "Refund request submitted to TSN",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
