export const runtime = "nodejs";

import { toErrorResponse, ok } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";
import { env } from "@/app/lib/env";
import { findUserByPhoneNumber } from "@/app/db/users";
import { findPaymentById } from "@/app/db/payments";

/**
 * NEW FLOW: Backend handles identity mapping, TSN handles payments
 * 
 * Frontend → Backend (validate identity) → TSN → Mempool → Cranker → On-chain
 * 
 * This endpoint forwards payment requests to TSN mempool.
 * For now returns a placeholder - full integration pending TIN implementation.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phoneNumber, amount, tokenMintAddress, senderWallet } = body;

    // Validate sender identity (until TIN is ready)
    const sender = await findUserByPhoneNumber(phoneNumber);
    if (!sender) {
      return toErrorResponse(new Error("Sender must register identity first"));
    }

    if (!env.TSN_ENABLED) {
      return toErrorResponse(new Error("TSN service not available"));
    }

    // TODO: Full TSN integration - create intent via TSN service
    // For now, return placeholder response
    logger.info("payment.create.deferred_to_tsn", { phoneNumber, amount });
    
    return ok({
      message: "Payment routing to TSN - implementation pending",
      status: "deferred",
      tsinEnabled: true,
    });
  } catch (error) {
    logger.error("api.payment.create.failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return toErrorResponse(error);
  }
}
