import { NextRequest, NextResponse } from "next/server";
import { listRecent, receive } from "../../../lib/store";
import { assertExternalWorkKind, publicCoordinationPayload, type WorkKind } from "../../../lib/work-contract";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { id?: string; kind?: WorkKind; payload?: Record<string, unknown> };
    if (!body.kind || !body.payload) return NextResponse.json({ error: "kind and payload are required" }, { status: 422 });
    assertExternalWorkKind(body.kind);
    const work = await receive({ id: body.id, kind: body.kind, payload: body.payload });
    return NextResponse.json({ id: work.id, kind: work.kind, status: work.status, stateVersion: work.stateVersion,
      payloadCommitment: work.payloadCommitment, payload: publicCoordinationPayload(work),
      receivedAt: work.receivedAt, updatedAt: work.updatedAt }, { status: 201 });
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
      ? {
          verificationType: item.verification.verificationType ?? "TSN_NODE",
          // Rejection diagnostics are deliberately limited to the Node's
          // bounded reason string. Never expose the verified payload or
          // signed/encrypted fields through this monitoring endpoint.
          reason: item.status === "REJECTED" && typeof item.verification.reason === "string"
            ? item.verification.reason.slice(0, 500)
            : null,
        }
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
