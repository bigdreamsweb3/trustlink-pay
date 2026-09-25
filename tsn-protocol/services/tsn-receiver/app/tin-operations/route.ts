import { NextRequest, NextResponse } from "next/server";
import { receive } from "../../lib/store";
import { publicCoordinationPayload } from "../../lib/work-contract";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return NextResponse.json({ error: "TIN_OPERATION_LIST_REQUIRES_NODE_AUTHORIZATION" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const work = await receive({ kind: "TIN_OPERATION", payload });
    return NextResponse.json({
      intentId: String(payload.ownerIntentHash ?? work.id),
      operationId: work.id,
      kind: work.kind,
      status: work.status,
      stateVersion: work.stateVersion,
      payloadCommitment: work.payloadCommitment,
      payload: publicCoordinationPayload(work),
      receivedAt: work.receivedAt,
      updatedAt: work.updatedAt,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RECEIVER_ERROR";
    return NextResponse.json({ error: message }, { status: message === "IDEMPOTENCY_CONFLICT" ? 409 : 400 });
  }
}
