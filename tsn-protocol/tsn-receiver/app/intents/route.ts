import { NextRequest, NextResponse } from "next/server";
import { requireService } from "../../lib/auth";
import { legacyIntent } from "../../lib/legacy-view";
import { listKind, receive } from "../../lib/store";
import { assertPaymentIntentIngress } from "../../lib/work-contract";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = String(payload.paymentId ?? "");
    if (!id) return NextResponse.json({ error: "paymentId is required" }, { status: 422 });
    assertPaymentIntentIngress(payload);
    return NextResponse.json(legacyIntent(await receive({ id, kind: "PAYMENT_INTENT", payload })), { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RECEIVER_ERROR";
    return NextResponse.json({ error: message }, { status: message === "IDEMPOTENCY_CONFLICT" ? 409 : 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    requireService(request, "cranker");
    return NextResponse.json((await listKind("PAYMENT_INTENT")).map(legacyIntent));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
