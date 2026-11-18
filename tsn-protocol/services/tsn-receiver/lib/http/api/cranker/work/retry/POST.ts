/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { authenticateCrankerRequest } from "../../../../../cranker-auth";
import type { retryLeasedSettlementFundingRoot } from "../../../../../store";
import type { NATIVE_REVERIFY_REASONS } from "../../../../../settlement-retry";

import type { Dependencies } from "./dependencies";

export async function POST(dependencies: Pick<Dependencies, "NATIVE_REVERIFY_REASONS" | "NextResponse" | "authenticateCrankerRequest" | "retryLeasedSettlementFundingRoot">, request: NextRequest) {
    try {
        const bodyText = await request.text();
        const owner = await dependencies.authenticateCrankerRequest(request, bodyText, "POST", "/api/cranker/work/retry");
        const body = JSON.parse(bodyText) as {
            id?: unknown;
            expectedVersion?: unknown;
            reason?: unknown;
        };
        if (typeof body.id !== "string" || !body.id.trim() || !Number.isSafeInteger(body.expectedVersion)
            || typeof body.reason !== "string" || !dependencies.NATIVE_REVERIFY_REASONS.has(body.reason)) {
            return dependencies.NextResponse.json({ error: "id, integer expectedVersion and funded-root retry reason are required" }, { status: 400 });
        }
        return dependencies.NextResponse.json(await dependencies.retryLeasedSettlementFundingRoot({
            id: body.id, expectedVersion: body.expectedVersion as number, owner, reason: body.reason as string, requestedBy: "authenticated-cranker-service",
        }));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "ERROR";
        const status = message.includes("CRANKER_") && !message.startsWith("SETTLEMENT_") ? 401 : message === "WORK_NOT_FOUND" ? 404 : 409;
        return dependencies.NextResponse.json({ error: message }, { status });
    }
}
