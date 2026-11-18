import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../../auth";
import type { resolveFailedSettlement } from "../../../../../../failed-settlement-resolution";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  requireService: typeof requireService;
  resolveFailedSettlement: typeof resolveFailedSettlement;
}
