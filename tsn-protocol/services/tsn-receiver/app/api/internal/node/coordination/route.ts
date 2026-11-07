import { NextRequest, NextResponse } from "next/server";
import { requireService } from "../../../../../lib/auth";
import { coordinationInventory, enqueueCoordination, deferPrivateCredit } from "../../../../../lib/private-credit-coordination";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { requireService(request, "node"); return NextResponse.json(await coordinationInventory(request.nextUrl.searchParams.get("after") ?? "")); }
  catch (e) { const error = e instanceof Error ? e.message : "ERROR"; return NextResponse.json({ error }, { status: error === "UNAUTHORIZED_SERVICE" ? 401 : 409 }); }
}
export async function POST(request: NextRequest) {
  try {
    requireService(request, "node");
    const body = await request.json();
    return NextResponse.json(body.action === "defer" ? await deferPrivateCredit(body) : await enqueueCoordination(body));
  } catch (e) { const error = e instanceof Error ? e.message : "ERROR"; return NextResponse.json({ error }, { status: error === "UNAUTHORIZED_SERVICE" ? 401 : 409 }); }
}
