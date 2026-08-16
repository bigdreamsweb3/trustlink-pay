import { NextRequest, NextResponse } from "next/server";
import { requireService } from "../../../../lib/auth";
import { attachCrankerAuthorization, leaseForCranker, transition } from "../../../../lib/store";
export const runtime = "nodejs";

function cleanUrl(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, "");
}

function errorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "ERROR";
  if (message === "UNAUTHORIZED_SERVICE") return 401;
  if (/fetch failed|ECONNRESET|network|timeout|temporarily unavailable/i.test(message)) return 503;
  if (message.includes("authorization service is unavailable")) return 503;
  if (message.includes("TSN Node authorization failed")) return 502;
  return 409;
}

export async function POST(request: NextRequest) {
  try {
    requireService(request, "cranker");
    const body = await request.json() as { crankerId?: string; supportedKinds?: Parameters<typeof leaseForCranker>[1] };
    if (!body.crankerId) throw new Error("crankerId is required");
    let work = await leaseForCranker(body.crankerId, body.supportedKinds);
    if (work && (work.kind === "CLAIM" || work.kind === "RECOVERY")) {
      const nodeUrls = [process.env.TSN_NODE_URL, process.env.TSN_NODE_FALLBACK_URL || "https://tsn-node.wasmer.app"].filter(Boolean).map((value) => cleanUrl(value as string));
      const nodeKey = process.env.TSN_RECEIVER_NODE_API_KEY;
      if (!nodeKey || nodeUrls.length === 0) throw new Error("TSN Node authorization service is not configured");
      let response: Response | undefined;
      let lastNodeError = "";
      for (const nodeUrl of [...new Set(nodeUrls)]) {
        try {
          response = await fetch(`${nodeUrl}/internal/settlement-authorizations/${work.kind.toLowerCase()}`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": nodeKey },
            body: JSON.stringify({ workId: work.id, crankerPubkey: body.crankerId }),
          });
          if (response.status < 500) break;
          lastNodeError = `${nodeUrl} returned ${response.status}`;
        } catch (error) {
          // A dead primary Node must not strand a leased claim when a
          // configured fallback is available. Continue to the next URL.
          lastNodeError = `${nodeUrl}: ${error instanceof Error ? error.message : "fetch failed"}`;
          response = undefined;
        }
      }
      if (!response) throw new Error(`TSN Node authorization service is unavailable (${lastNodeError || "fetch failed"})`);
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`TSN Node authorization failed (${response.status}): ${detail}`);
      }
      const authorization = await response.json() as Record<string, unknown>;
      work = await attachCrankerAuthorization({ id: work.id, owner: body.crankerId, expectedVersion: work.stateVersion, authorization });
    }
    // The ingress payload may contain private routing identifiers required by
    // the Node. Crankers receive only the Node-verified, privacy-minimized view.
    return NextResponse.json({ work: work ? { ...work, payload: {} } : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: errorStatus(error) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    requireService(request, "cranker");
    const body = await request.json() as Parameters<typeof transition>[0];
    return NextResponse.json(await transition({ ...body, actor: "cranker" }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: errorStatus(error) });
  }
}
