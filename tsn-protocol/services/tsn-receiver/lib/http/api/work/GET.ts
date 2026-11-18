/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { listRecent, receive } from "../../../store";
import type { assertExternalWorkKind, publicCoordinationPayload, ReceiverWork, WorkKind } from "../../../work-contract";

import type { Dependencies } from "./dependencies";
import { recentWorkView } from "./recentWorkView";
export async function GET(dependencies: Pick<Dependencies, "NextResponse" | "listRecent">) {
    const work = await dependencies.listRecent();
    return dependencies.NextResponse.json(work.map(recentWorkView), {
        headers: { "cache-control": "public, max-age=2, stale-while-revalidate=5" },
    });
}
