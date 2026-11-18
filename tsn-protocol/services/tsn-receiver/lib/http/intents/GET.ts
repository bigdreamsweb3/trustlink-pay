/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../auth";
import type { publicIntent } from "../../public-view";
import type { listKind, receive } from "../../store";
import type { assertAuthorizedFundingIngress } from "../../work-contract";

import type { Dependencies } from "./dependencies";

export async function GET(dependencies: Pick<Dependencies, "NextResponse" | "listKind" | "publicIntent" | "requireService">, request: NextRequest) {
    try {
        dependencies.requireService(request, "node");
        return dependencies.NextResponse.json((await dependencies.listKind("AUTHORIZED_FUNDING")).map(dependencies.publicIntent));
    }
    catch {
        return dependencies.NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
}
