import { NextRequest, NextResponse } from "next/server";
import { getWork } from "../../../../lib/store";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const work = await getWork(id);
  if (!work || work.kind !== "TIN_OPERATION") {
    return NextResponse.json({ error: "TIN_OPERATION_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({
    operationId: work.id,
    kind: work.kind,
    status: work.status,
    receivedAt: work.receivedAt,
    updatedAt: work.updatedAt,
    verificationType: work.verification?.verificationType ?? null,
    result: work.result ? {
      signature: work.result.signature ?? null,
      stage: work.result.stage ?? null,
    } : null,
  }, { headers: { "cache-control": "no-store" } });
}
