import { NextRequest, NextResponse } from "next/server";
import { requireService } from "../../../../../../lib/auth";
import { retrySettlementSnapshot } from "../../../../../../lib/store";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireService(request, "node");
    const body = await request.json() as { id?: unknown; expectedVersion?: unknown };
    if (typeof body.id !== "string" || !body.id.trim() || !Number.isSafeInteger(body.expectedVersion)) {
      return NextResponse.json({ error: "id and integer expectedVersion are required" }, { status: 400 });
    }
    return NextResponse.json(await retrySettlementSnapshot({
      id: body.id, expectedVersion: body.expectedVersion as number, requestedBy: "authenticated-node-service",
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHORIZED_SERVICE" ? 401 : message === "WORK_NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
