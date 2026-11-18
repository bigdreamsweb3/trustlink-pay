import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../auth";
import type { executeStateOperation } from "../../../../../node-state-store";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  requireService: typeof requireService;
  executeStateOperation: typeof executeStateOperation;
}
