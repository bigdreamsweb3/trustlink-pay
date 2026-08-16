import { NextRequest, NextResponse } from "next/server";
import { requireService } from "../../lib/auth";
import { legacyClaim } from "../../lib/legacy-view";
import { getWork, listKind } from "../../lib/store";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    if (!payload.intentId) return NextResponse.json({ error: "intentId is required" }, { status: 422 });
    const intentId = String(payload.intentId);
    const intent = await getWork(intentId);
    if (!intent || intent.kind !== "PAYMENT_INTENT") {
      return NextResponse.json({ error: "Payment intent is not registered" }, { status: 409 });
    }
    if (intent.status !== "CONFIRMED" || !intent.verification?.verificationType) {
      return NextResponse.json({
        error: "Claim work is created only after TSN Node verification and confirmed funding",
      }, { status: 409 });
    }
    const claim = await getWork(`claim-${intentId}`);
    if (!claim || claim.kind !== "CLAIM") {
      return NextResponse.json({ error: "Claim work is not available yet" }, { status: 409 });
    }
    return NextResponse.json(legacyClaim(claim), { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "RECEIVER_ERROR" }, { status: 409 });
  }
}

export async function GET(request: NextRequest) {
  try {
    requireService(request, "cranker");
    return NextResponse.json((await listKind("CLAIM")).map(legacyClaim));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
