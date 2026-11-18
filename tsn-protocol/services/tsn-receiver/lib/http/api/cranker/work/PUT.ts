/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { authenticateCrankerRequest, enforceCrankerLeaseRateLimit } from "../../../../cranker-auth";
import type { attachCrankerAuthorization, leaseForCranker, recordSettlementSubmission, retryLeasedSettlementFundingRoot, transition } from "../../../../store";
import type { reconcileExpiredCrankerConfirmation } from "../../../../settlement-reconciliation";
import type { NATIVE_REVERIFY_REASONS } from "../../../../settlement-retry";
import type { requestNodeAuthorization } from "../../../../node-authorizations";
import type { crankerAuthorizationForWork, crankerExecutionPayload, verifiedPayloadForWork } from "../../../../work-contract";

import type { Dependencies } from "./dependencies";
import { errorStatus } from "./errorStatus";
export async function PUT(dependencies: Pick<Dependencies, "NextResponse" | "authenticateCrankerRequest" | "recordSettlementSubmission">, request: NextRequest) {
    try {
        const bodyText = await request.text();
        const owner = await dependencies.authenticateCrankerRequest(request, bodyText, "PUT", "/api/cranker/work");
        const body = JSON.parse(bodyText) as {
            id: string;
            expectedVersion: number;
            evidence: Record<string, unknown>;
        };
        if (typeof body.id !== "string" || !Number.isSafeInteger(body.expectedVersion)
            || !body.evidence || typeof body.evidence !== "object" || Array.isArray(body.evidence)) {
            return dependencies.NextResponse.json({ error: "Invalid settlement submission checkpoint" }, { status: 400 });
        }
        return dependencies.NextResponse.json(await dependencies.recordSettlementSubmission({ ...body, owner }));
    }
    catch (error) {
        return dependencies.NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: errorStatus(error) });
    }
}
