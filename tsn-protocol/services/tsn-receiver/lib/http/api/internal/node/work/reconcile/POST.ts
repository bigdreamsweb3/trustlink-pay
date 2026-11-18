/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../../auth";
import type { reconcileSettlementReceipt } from "../../../../../../settlement-reconciliation";

import type { Dependencies } from "./dependencies";

export async function POST(dependencies: Pick<Dependencies, "NextResponse" | "reconcileSettlementReceipt" | "requireService">, request: NextRequest) {
    try {
        dependencies.requireService(request, "node");
        const body = await request.json();
        if (typeof body.id !== "string" || !body.id.trim() || !Number.isSafeInteger(body.expectedVersion)
            || !/^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(body.signature ?? "") || typeof body.execute !== "boolean") {
            return dependencies.NextResponse.json({ error: "id, expectedVersion, signature and boolean execute are required" }, { status: 400 });
        }
        return dependencies.NextResponse.json(await dependencies.reconcileSettlementReceipt(body));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "ERROR";
        return dependencies.NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED_SERVICE" ? 401 : message === "WORK_NOT_FOUND" ? 404 : 409 });
    }
}
