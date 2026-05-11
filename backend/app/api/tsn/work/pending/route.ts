export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { env } from "@/app/lib/env";
import { TsnHttpClient } from "../../../../../../tsn/src";

export async function GET() {
  try {
    if (!env.TSN_ENABLED) {
      return ok({ intents: [] });
    }

    const client = new TsnHttpClient({ baseUrl: env.TSN_MEMPOOL_URL });
    return ok(await client.listPendingWork(50));
  } catch (error) {
    return toErrorResponse(error);
  }
}

