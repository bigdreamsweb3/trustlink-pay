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
export async function PATCH(dependencies: Pick<Dependencies, "NextResponse" | "authenticateCrankerRequest" | "reconcileExpiredCrankerConfirmation" | "transition">, request: NextRequest) {
    try {
        const bodyText = await request.text();
        const operator = await dependencies.authenticateCrankerRequest(request, bodyText, "PATCH", "/api/cranker/work");
        const body = JSON.parse(bodyText) as Parameters<typeof transition>[0];
        try {
            return dependencies.NextResponse.json(await dependencies.transition({ ...body, owner: operator, actor: "cranker" }));
        }
        catch (error) {
            const code = error instanceof Error ? error.message : "ERROR";
            if ((code === "LEASE_INVALID" || code === "STALE_STATE_VERSION") && body.status === "CONFIRMED"
                && typeof body.evidence?.signature === "string" && /^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(body.evidence.signature)) {
                return dependencies.NextResponse.json(await dependencies.reconcileExpiredCrankerConfirmation({
                    id: body.id, owner: operator, expectedVersion: body.expectedVersion, signature: body.evidence.signature,
                }));
            }
            throw error;
        }
    }
    catch (error) {
        return dependencies.NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: errorStatus(error) });
    }
}
