/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { receive } from "../../store";
import type { publicCoordinationPayload } from "../../work-contract";

import type { Dependencies } from "./dependencies";

export async function GET(dependencies: Pick<Dependencies, "NextResponse">, request: NextRequest) {
    return dependencies.NextResponse.json({ error: "TIN_OPERATION_LIST_REQUIRES_NODE_AUTHORIZATION" }, { status: 401 });
}
