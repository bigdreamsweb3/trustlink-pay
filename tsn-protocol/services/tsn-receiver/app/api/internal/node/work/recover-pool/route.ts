import { NextRequest, NextResponse } from "next/server";
import { requireService } from "../../../../../../lib/auth";
import { recoverExpiredFundingPool } from "../../../../../../lib/settlement-reconciliation";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireService(request, "node");
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.id !== "string" || !body.id.trim() || !Number.isSafeInteger(body.expectedVersion)
        || !/^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(body.signature ?? "") || typeof body.execute !== "boolean") {
      return NextResponse.json({ error: "id, expectedVersion, signature and boolean execute are required" }, { status: 400 });
    }
    return NextResponse.json(await recoverExpiredFundingPool(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED_SERVICE" ? 401 : message === "WORK_NOT_FOUND" ? 404 : 409 });
  }
}
