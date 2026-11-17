import { NextRequest, NextResponse } from "next/server";
import { authenticateCrankerRequest, enforceCrankerLeaseRateLimit } from "../../../../lib/cranker-auth";
import { requestNodeAuthorization } from "../../../../lib/node-authorizations";

export const runtime = "nodejs";

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

    const { configured, response, nodeStatus } = await requestNodeAuthorization(
      "/internal/settlement-authorizations/signature", { workId, crankerPubkey: operator, messageBase64 },
    );
    if (!configured) return NextResponse.json({ error: "TSN Node signing service is not configured" }, { status: 503 });
    if (!response) return NextResponse.json({ error: "TSN Node signing service is unavailable", nodeStatus }, { status: 503 });
    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message.includes("UNAUTHORIZED_SERVICE") || /CRANKER_SIGNATURE|CRANKER_PUBLIC_KEY|CRANKER_MOTHER|CRANKER_OPERATOR|CRANKER_SESSION|CRANKER_REQUEST|CHALLENGE|REQUEST_EXPIRED/.test(message)
      ? 401
      : message.includes("RATE_LIMITED") ? 429 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
