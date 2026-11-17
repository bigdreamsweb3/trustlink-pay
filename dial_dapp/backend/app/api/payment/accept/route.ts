export const runtime = "nodejs";

import { toErrorResponse, ok } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";

/**
 * Accept payment (now handled by TSN)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { paymentId } = body;
    
    logger.info("payment.accept.deferred_to_tsn", { paymentId });
    
    return ok({
      message: "Payment acceptance handled by TSN",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
