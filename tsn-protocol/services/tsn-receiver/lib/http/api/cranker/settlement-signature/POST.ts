/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { authenticateCrankerRequest, enforceCrankerLeaseRateLimit } from "../../../../cranker-auth";
import type { requestNodeAuthorization } from "../../../../node-authorizations";

import type { Dependencies } from "./dependencies";

export async function POST(dependencies: Pick<Dependencies, "NextResponse" | "authenticateCrankerRequest" | "enforceCrankerLeaseRateLimit" | "requestNodeAuthorization">, request: NextRequest) {
    try {
        const bodyText = await request.text();
        const operator = await dependencies.authenticateCrankerRequest(request, bodyText, "POST", "/api/cranker/settlement-signature");
        await dependencies.enforceCrankerLeaseRateLimit(operator);
        const body = JSON.parse(bodyText) as {
            workId?: unknown;
            messageBase64?: unknown;
        };
        const workId = String(body.workId ?? "").trim();
        const messageBase64 = String(body.messageBase64 ?? "").trim();
        if (!workId || !messageBase64) {
            return dependencies.NextResponse.json({ error: "workId and messageBase64 are required" }, { status: 422 });
        }
        const { configured, response, nodeStatus } = await dependencies.requestNodeAuthorization("/internal/settlement-authorizations/signature", { workId, crankerPubkey: operator, messageBase64 });
        if (!configured)
            return dependencies.NextResponse.json({ error: "TSN Node signing service is not configured" }, { status: 503 });
        if (!response)
            return dependencies.NextResponse.json({ error: "TSN Node signing service is unavailable", nodeStatus }, { status: 503 });
        const responseBody = await response.text();
        return new dependencies.NextResponse(responseBody, {
            status: response.status,
            headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "ERROR";
        const status = message.includes("UNAUTHORIZED_SERVICE") || /CRANKER_SIGNATURE|CRANKER_PUBLIC_KEY|CRANKER_MOTHER|CRANKER_OPERATOR|CRANKER_SESSION|CRANKER_REQUEST|CHALLENGE|REQUEST_EXPIRED/.test(message)
            ? 401
            : message.includes("RATE_LIMITED") ? 429 : 409;
        return dependencies.NextResponse.json({ error: message }, { status });
    }
}
