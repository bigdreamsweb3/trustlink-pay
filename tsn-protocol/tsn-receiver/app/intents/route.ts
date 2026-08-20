import { NextRequest, NextResponse } from "next/server";
import { requireService } from "../../lib/auth";
import { publicIntent } from "../../lib/public-view";
import { listKind, receive } from "../../lib/store";
import { assertPaymentIntentIngress } from "../../lib/work-contract";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireService(request, "node");
    const payload = await request.json() as Record<string, unknown>;
    const id = String(payload.paymentId ?? "");
    if (!id) return NextResponse.json({ error: "paymentId is required" }, { status: 422 });
    assertPaymentIntentIngress(payload);
    return NextResponse.json(publicIntent(await receive({ id, kind: "PAYMENT_INTENT", payload })), { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RECEIVER_ERROR";
    return NextResponse.json({ error: message }, { status: message === "IDEMPOTENCY_CONFLICT" ? 409 : 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    requireService(request, "node");
    return NextResponse.json((await listKind("PAYMENT_INTENT")).map(publicIntent));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
