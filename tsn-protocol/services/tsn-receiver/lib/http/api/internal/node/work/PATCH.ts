/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../auth";
import type { getWorkForNode, leaseForNode, renewNodeLease, transition } from "../../../../../store";

import type { Dependencies } from "./dependencies";

export async function PATCH(dependencies: Pick<Dependencies, "NextResponse" | "requireService" | "transition">, request: NextRequest) {
    try {
        dependencies.requireService(request, "node");
        const body = await request.json() as Parameters<typeof transition>[0];
        return dependencies.NextResponse.json(await dependencies.transition({ ...body, actor: "node" }));
    }
    catch (error) {
        return dependencies.NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: 409 });
    }
}
