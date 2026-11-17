export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      event?: string;
      meta?: Record<string, unknown>;
      level?: "info" | "warn" | "error";
    };
    const event = String(body?.event ?? "tsn.frontend");
    const meta = body?.meta ?? {};
    const level = body?.level ?? "info";

    if (level === "error") {
      logger.error(event, meta);
    } else if (level === "warn") {
      logger.warn(event, meta);
    } else {
      logger.info(event, meta);
    }

    return ok({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
