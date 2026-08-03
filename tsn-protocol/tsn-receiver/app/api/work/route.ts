import { NextRequest, NextResponse } from "next/server";
import { listRecent, receive } from "../../../lib/store";
import type { WorkKind } from "../../../lib/work-contract";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { id?: string; kind?: WorkKind; payload?: Record<string, unknown> };
    if (!body.kind || !body.payload) return NextResponse.json({ error: "kind and payload are required" }, { status: 422 });
    return NextResponse.json(await receive({ id: body.id, kind: body.kind, payload: body.payload }), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RECEIVER_ERROR";
    return NextResponse.json({ error: message }, { status: message === "IDEMPOTENCY_CONFLICT" ? 409 : 400 });
  }
}

export async function GET() {
  const work = await listRecent();
  return NextResponse.json(work.map((item) => ({
    id: item.id,
    kind: item.kind,
    status: item.status,
    stateVersion: item.stateVersion,
    payloadCommitment: item.payloadCommitment,
    receivedAt: item.receivedAt,
    updatedAt: item.updatedAt,
    verification: item.verification
      ? { verificationType: item.verification.verificationType ?? "TSN_NODE" }
      : null,
    result: item.result
      ? {
          signature: item.result.signature ?? null,
          stage: item.result.stage ?? null,
          reason: item.result.reason ?? null,
        }
      : null,
  })), {
    headers: { "cache-control": "public, max-age=2, stale-while-revalidate=5" },
  });
}
