import type { NextRequest, NextResponse } from "next/server";
import type { receive } from "../../store";
import type { publicCoordinationPayload } from "../../work-contract";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  receive: typeof receive;
  publicCoordinationPayload: typeof publicCoordinationPayload;
}
