/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../../auth";
import type { retrySettlementSnapshot } from "../../../../../../store";

import type { Dependencies } from "./dependencies";

export async function POST(dependencies: Pick<Dependencies, "NextResponse" | "requireService" | "retrySettlementSnapshot">, request: NextRequest) {
    try {
        dependencies.requireService(request, "node");
        const body = await request.json() as {
            id?: unknown;
            expectedVersion?: unknown;
        };
        if (typeof body.id !== "string" || !body.id.trim() || !Number.isSafeInteger(body.expectedVersion)) {
            return dependencies.NextResponse.json({ error: "id and integer expectedVersion are required" }, { status: 400 });
        }
        return dependencies.NextResponse.json(await dependencies.retrySettlementSnapshot({
            id: body.id, expectedVersion: body.expectedVersion as number, requestedBy: "authenticated-node-service",
        }));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "ERROR";
        const status = message === "UNAUTHORIZED_SERVICE" ? 401 : message === "WORK_NOT_FOUND" ? 404 : 409;
        return dependencies.NextResponse.json({ error: message }, { status });
    }
}
