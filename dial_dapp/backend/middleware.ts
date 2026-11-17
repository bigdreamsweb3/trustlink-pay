import { NextRequest, NextResponse } from "next/server";

import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { recordRequest } from "@/app/lib/request-monitor";

export function middleware(request: NextRequest) {
  if (env.LOG_SUCCESS_REQUESTS) {
    const name = request.nextUrl.pathname;
    const type = request.method;
    const key = `${type}:${name}`;
    const sample = recordRequest(key);
    if (!sample.shouldLog) {
      return NextResponse.next();
    }

    if (sample.level === "warn") {
      logger.warn("api.request.burst", {
        name,
        type,
        countInWindow: sample.count,
        duplicatesInWindow: sample.duplicateCount,
        windowMs: 10_000,
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
