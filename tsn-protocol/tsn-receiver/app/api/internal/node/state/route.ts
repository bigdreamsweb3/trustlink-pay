import { NextRequest, NextResponse } from "next/server";
import { requireService } from "../../../../../lib/auth";
import { executeStateOperation } from "../../../../../lib/node-state-store";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireService(request, "node");
    return NextResponse.json(await executeStateOperation(await request.json()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "STATE_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED_SERVICE" ? 401 : 400 });
  }
}
