import { NextRequest, NextResponse } from "next/server";
import { authenticateCrankerRequest, enforceCrankerLeaseRateLimit } from "../../../../lib/cranker-auth";

export const runtime = "nodejs";

function cleanUrl(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const operator = await authenticateCrankerRequest(
      request,
      bodyText,
      "POST",
      "/api/cranker/settlement-signature",
    );
    await enforceCrankerLeaseRateLimit(operator);
    const body = JSON.parse(bodyText) as { workId?: unknown; messageBase64?: unknown };
    const workId = String(body.workId ?? "").trim();
    const messageBase64 = String(body.messageBase64 ?? "").trim();
    if (!workId || !messageBase64) {
      return NextResponse.json({ error: "workId and messageBase64 are required" }, { status: 422 });
    }

    const nodeKey = process.env.TSN_RECEIVER_NODE_API_KEY;
    const nodeUrls = [process.env.TSN_NODE_URL, process.env.TSN_NODE_FALLBACK_URL]
      .filter((value): value is string => Boolean(value?.trim()))
      .map(cleanUrl);
    if (!nodeKey || nodeUrls.length === 0) {
      return NextResponse.json({ error: "TSN Node signing service is not configured" }, { status: 503 });
    }

    let response: Response | undefined;
    let lastNodeError = "";
    for (const nodeUrl of [...new Set(nodeUrls)]) {
      try {
        response = await fetch(`${nodeUrl}/internal/settlement-authorizations/signature`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": nodeKey },
          body: JSON.stringify({ workId, crankerPubkey: operator, messageBase64 }),
          cache: "no-store",
        });
        if (response.ok) break;
        if (response.status !== 404 && response.status < 500) break;
        lastNodeError = `${nodeUrl} returned ${response.status}`;
        response = undefined;
      } catch (error) {
        lastNodeError = `${nodeUrl}: ${error instanceof Error ? error.message : "fetch failed"}`;
        response = undefined;
      }
    }
    if (!response) {
      return NextResponse.json({ error: "TSN Node signing service is unavailable", detail: lastNodeError }, { status: 503 });
    }
    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message.includes("UNAUTHORIZED_SERVICE") || /CRANKER_SIGNATURE|CRANKER_MOTHER|CRANKER_OPERATOR|CHALLENGE|REQUEST_EXPIRED/.test(message)
      ? 401
      : message.includes("RATE_LIMITED") ? 429 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
