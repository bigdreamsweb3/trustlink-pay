import type { NextRequest, NextResponse } from "next/server";
import type { issueCrankerSession } from "../../../../../cranker-auth";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  issueCrankerSession: typeof issueCrankerSession;
}
