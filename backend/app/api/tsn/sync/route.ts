export const runtime = "nodejs";

import { ok } from "@/app/lib/http";

/**
 * DEPRECATED: The cron-based TSN status sync has been removed.
 * This endpoint no longer performs background synchronization.
 * Transaction status is now refreshed on-demand via the client-triggered
 * /api/payment/[paymentId]/refresh-status endpoint.
 */
export async function GET() {
  return ok({
    scanned: 0,
    synchronized: 0,
    deprecated: true,
    message:
      "Background TSN sync has been removed. Use /api/payment/[id]/refresh-status for on-demand status updates.",
  });
}
