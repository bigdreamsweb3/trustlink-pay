import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getWork } from "../../../../lib/store";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const work = await getWork(id);
  if (!work) {
    return NextResponse.json({ error: "RECEIVER_WORK_NOT_FOUND" }, { status: 404 });
  }
  if (work.kind === "AUTHORIZED_FUNDING") {
    const settlementId = `settlement-${createHash("sha256").update(`${work.id}:${work.payloadCommitment}`).digest("hex").slice(0, 32)}`;
    const settlement = await getWork(settlementId);
    return NextResponse.json({
      operationId: work.id,
      kind: work.kind,
      status: work.status,
      receivedAt: work.receivedAt,
      updatedAt: work.updatedAt,
      verificationType: work.verification?.verificationType ?? null,
      result: work.result ? { signature: work.result.signature ?? null, stage: work.result.stage ?? null } : null,
      settlement: settlement ? {
        operationId: settlement.id,
        status: settlement.status,
        verificationType: settlement.verification?.verificationType ?? null,
        result: settlement.result ? { signature: settlement.result.signature ?? null, stage: settlement.result.stage ?? null } : null,
      } : null,
    }, { headers: { "cache-control": "no-store" } });
  }
  if (work.kind !== "TIN_OPERATION") {
    return NextResponse.json({ error: "WORK_STATUS_UNSUPPORTED" }, { status: 404 });
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
