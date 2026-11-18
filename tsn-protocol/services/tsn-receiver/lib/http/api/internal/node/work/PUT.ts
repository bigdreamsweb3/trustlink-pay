/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../auth";
import type { getWorkForNode, leaseForNode, renewNodeLease, transition } from "../../../../../store";

import type { Dependencies } from "./dependencies";

export async function PUT(dependencies: Pick<Dependencies, "NextResponse" | "renewNodeLease" | "requireService">, request: NextRequest) {
    try {
        dependencies.requireService(request, "node");
        const body = await request.json() as Partial<Parameters<typeof renewNodeLease>[0]>;
        if (typeof body.id !== "string" || !body.id.trim()
            || typeof body.owner !== "string" || !body.owner.trim()
            || typeof body.leaseId !== "string" || !body.leaseId.trim()
            || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1
            || !Number.isSafeInteger(body.leaseVersion) || Number(body.leaseVersion) < 1) {
            return dependencies.NextResponse.json({ error: "id, owner, leaseId and positive integer versions are required" }, { status: 400 });
        }
        return dependencies.NextResponse.json(await dependencies.renewNodeLease(body as Parameters<typeof renewNodeLease>[0]));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "ERROR";
        const status = message === "UNAUTHORIZED_SERVICE" ? 401 : message === "WORK_NOT_FOUND" ? 404 : 409;
        return dependencies.NextResponse.json({ error: message }, { status });
    }
}
