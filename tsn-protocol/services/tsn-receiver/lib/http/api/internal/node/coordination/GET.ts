/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../auth";
import type { coordinationInventory, enqueueCoordination, deferPrivateCredit } from "../../../../../private-credit-coordination";

import type { Dependencies } from "./dependencies";

export async function GET(dependencies: Pick<Dependencies, "NextResponse" | "coordinationInventory" | "requireService">, request: NextRequest) {
    try {
        dependencies.requireService(request, "node");
        return dependencies.NextResponse.json(await dependencies.coordinationInventory(request.nextUrl.searchParams.get("after") ?? ""));
    }
    catch (e) {
        const error = e instanceof Error ? e.message : "ERROR";
        return dependencies.NextResponse.json({ error }, { status: error === "UNAUTHORIZED_SERVICE" ? 401 : 409 });
    }
}
