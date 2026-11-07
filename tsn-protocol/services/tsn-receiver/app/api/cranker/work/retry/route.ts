import { NextRequest, NextResponse } from "next/server";
import { authenticateCrankerRequest } from "../../../../../lib/cranker-auth";
import { retryLeasedSettlementFundingRoot } from "../../../../../lib/store";
import { NATIVE_REVERIFY_REASONS } from "../../../../../lib/settlement-retry";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const owner = await authenticateCrankerRequest(request, bodyText, "POST", "/api/cranker/work/retry");
    const body = JSON.parse(bodyText) as { id?: unknown; expectedVersion?: unknown; reason?: unknown };
    if (typeof body.id !== "string" || !body.id.trim() || !Number.isSafeInteger(body.expectedVersion)
        || typeof body.reason !== "string" || !NATIVE_REVERIFY_REASONS.has(body.reason)) {
      return NextResponse.json({ error: "id, integer expectedVersion and funded-root retry reason are required" }, { status: 400 });
    }
    return NextResponse.json(await retryLeasedSettlementFundingRoot({
      id: body.id, expectedVersion: body.expectedVersion as number, owner, reason: body.reason as string, requestedBy: "authenticated-cranker-service",
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message.includes("CRANKER_") && !message.startsWith("SETTLEMENT_") ? 401 : message === "WORK_NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
