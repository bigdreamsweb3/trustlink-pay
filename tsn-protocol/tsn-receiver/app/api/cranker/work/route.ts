import { NextRequest, NextResponse } from "next/server";
import { requireService } from "../../../../lib/auth";
import { attachCrankerAuthorization, leaseForCranker, transition } from "../../../../lib/store";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireService(request, "cranker");
    const body = await request.json() as { crankerId?: string; supportedKinds?: Parameters<typeof leaseForCranker>[1] };
    if (!body.crankerId) throw new Error("crankerId is required");
    let work = await leaseForCranker(body.crankerId, body.supportedKinds);
    if (work && (work.kind === "CLAIM" || work.kind === "RECOVERY")) {
      const nodeUrl = process.env.TSN_NODE_URL?.replace(/\/$/, "");
      const nodeKey = process.env.TSN_RECEIVER_NODE_API_KEY;
      if (!nodeUrl || !nodeKey) throw new Error("TSN Node authorization service is not configured");
      const response = await fetch(`${nodeUrl}/internal/settlement-authorizations/${work.kind.toLowerCase()}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": nodeKey },
        body: JSON.stringify({ workId: work.id, crankerPubkey: body.crankerId }),
      });
      if (!response.ok) throw new Error(`TSN Node authorization failed (${response.status})`);
      const authorization = await response.json() as Record<string, unknown>;
      work = await attachCrankerAuthorization({ id: work.id, owner: body.crankerId, expectedVersion: work.stateVersion, authorization });
    }
    // The ingress payload may contain private routing identifiers required by
    // the Node. Crankers receive only the Node-verified, privacy-minimized view.
    return NextResponse.json({ work: work ? { ...work, payload: {} } : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    requireService(request, "cranker");
    const body = await request.json() as Parameters<typeof transition>[0];
    return NextResponse.json(await transition({ ...body, actor: "cranker" }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: 409 });
  }
}
