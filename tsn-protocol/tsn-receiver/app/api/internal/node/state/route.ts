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
    if (message === "UNAUTHORIZED_SERVICE") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (/^STATE_(KEY_REQUIRED|FIELD_REQUIRED|OPERATION_INVALID)$/.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("TSN Receiver node-state storage failure", error);
    return NextResponse.json({ error: "STATE_STORAGE_UNAVAILABLE" }, { status: 500 });
  }
}
