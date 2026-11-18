/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../auth";
import type { coordinationInventory, enqueueCoordination, deferPrivateCredit } from "../../../../../private-credit-coordination";

import type { Dependencies } from "./dependencies";

export async function POST(dependencies: Pick<Dependencies, "NextResponse" | "deferPrivateCredit" | "enqueueCoordination" | "requireService">, request: NextRequest) {
    try {
        dependencies.requireService(request, "node");
        const body = await request.json();
        return dependencies.NextResponse.json(body.action === "defer" ? await dependencies.deferPrivateCredit(body) : await dependencies.enqueueCoordination(body));
    }
    catch (e) {
        const error = e instanceof Error ? e.message : "ERROR";
        return dependencies.NextResponse.json({ error }, { status: error === "UNAUTHORIZED_SERVICE" ? 401 : 409 });
    }
}
