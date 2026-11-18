/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../auth";
import type { getWorkForNode, leaseForNode, renewNodeLease, transition } from "../../../../../store";

import type { Dependencies } from "./dependencies";

export async function GET(dependencies: Pick<Dependencies, "NextResponse" | "getWorkForNode" | "requireService">, request: NextRequest) {
    try {
        dependencies.requireService(request, "node");
        const id = request.nextUrl.searchParams.get("id");
        if (!id)
            throw new Error("id is required");
        const work = await dependencies.getWorkForNode(id);
        return work ? dependencies.NextResponse.json({ work }) : dependencies.NextResponse.json({ error: "WORK_NOT_FOUND" }, { status: 404 });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "ERROR";
        const status = message === "UNAUTHORIZED_SERVICE" ? 401 : message.includes("required") ? 400 : 500;
        console.error("[receiver] node work lookup failed", message);
        return dependencies.NextResponse.json({ error: message }, { status });
    }
}
