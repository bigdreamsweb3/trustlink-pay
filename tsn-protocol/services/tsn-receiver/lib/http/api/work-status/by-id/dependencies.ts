import type { NextRequest, NextResponse } from "next/server";
import type { createHash } from "node:crypto";
import type { getWork } from "../../../../store";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  createHash: typeof createHash;
  getWork: typeof getWork;
}
