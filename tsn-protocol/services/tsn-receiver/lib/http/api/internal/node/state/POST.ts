/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../auth";
import type { executeStateOperation } from "../../../../../node-state-store";

import type { Dependencies } from "./dependencies";

export async function POST(dependencies: Pick<Dependencies, "NextResponse" | "executeStateOperation" | "requireService">, request: NextRequest) {
    try {
        dependencies.requireService(request, "node");
        return dependencies.NextResponse.json(await dependencies.executeStateOperation(await request.json()));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "STATE_ERROR";
        if (message === "UNAUTHORIZED_SERVICE") {
            return dependencies.NextResponse.json({ error: message }, { status: 401 });
        }
        if (/^STATE_(KEY_REQUIRED|FIELD_REQUIRED|OPERATION_INVALID)$/.test(message)) {
            return dependencies.NextResponse.json({ error: message }, { status: 400 });
        }
        console.error("TSN Receiver node-state storage failure", error);
        return dependencies.NextResponse.json({ error: "STATE_STORAGE_UNAVAILABLE" }, { status: 500 });
    }
}
