import { NextRequest, NextResponse } from "next/server";
import { requireService } from "../../../../../lib/auth";
import { getWorkForNode, leaseForNode, transition } from "../../../../../lib/store";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireService(request, "node");
    const body = await request.json() as { nodeId?: string; supportedKinds?: Parameters<typeof leaseForNode>[1] };
    if (!body.nodeId) throw new Error("nodeId is required");
    return NextResponse.json({ work: await leaseForNode(body.nodeId, body.supportedKinds) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHORIZED_SERVICE" ? 401 : message.includes("required") ? 400 : 500;
    console.error("[receiver] node work request failed", message);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: NextRequest) {
  try {
    requireService(request, "node");
    const id = request.nextUrl.searchParams.get("id");
    if (!id) throw new Error("id is required");
    const work = await getWorkForNode(id);
    return work ? NextResponse.json({ work }) : NextResponse.json({ error: "WORK_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHORIZED_SERVICE" ? 401 : message.includes("required") ? 400 : 500;
    console.error("[receiver] node work lookup failed", message);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    requireService(request, "node");
    const body = await request.json() as Parameters<typeof transition>[0];
    return NextResponse.json(await transition({ ...body, actor: "node" }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: 409 });
  }
}
