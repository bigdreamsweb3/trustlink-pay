export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { env } from "@/app/lib/env";
import { fail, ok } from "@/app/lib/http";
import { syncActiveTsnPaymentIntents } from "@/app/services/tsn";

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return fail("TSN status sync is not configured", 503);
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${env.CRON_SECRET}`) {
    return fail("Unauthorized", 401);
  }

  const result = await syncActiveTsnPaymentIntents(200);
  return ok(result);
}
