import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireService } from "../../lib/auth";
import { legacyClaim } from "../../lib/legacy-view";
import { listKind, receive } from "../../lib/store";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    if (!payload.intentId) return NextResponse.json({ error: "intentId is required" }, { status: 422 });
    return NextResponse.json(legacyClaim(await receive({
      id: String(payload.id ?? randomUUID()),
      kind: "CLAIM",
      payload,
    })), { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "RECEIVER_ERROR" }, { status: 400 });
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
