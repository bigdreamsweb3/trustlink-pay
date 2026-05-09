export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { env } from "@/app/lib/env";
import { listPendingIntentsWithClaimRequests } from "@/app/db/tsn";

export async function GET() {
  try {
    if (!env.TSN_ENABLED) {
      return ok({ intents: [] });
    }

    const work = await listPendingIntentsWithClaimRequests(50);
    return ok({
      intents: work.map((item) => ({
        intent: item.intent,
        claimRequestId: item.claimRequestId,
        destinationWallet: item.destinationWallet,
        autoclaim: item.autoclaim,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

