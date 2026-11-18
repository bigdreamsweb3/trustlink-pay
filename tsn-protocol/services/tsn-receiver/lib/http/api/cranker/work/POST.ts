/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { authenticateCrankerRequest, enforceCrankerLeaseRateLimit } from "../../../../cranker-auth";
import type { attachCrankerAuthorization, leaseForCranker, recordSettlementSubmission, retryLeasedSettlementFundingRoot, transition } from "../../../../store";
import type { reconcileExpiredCrankerConfirmation } from "../../../../settlement-reconciliation";
import type { NATIVE_REVERIFY_REASONS } from "../../../../settlement-retry";
import type { requestNodeAuthorization } from "../../../../node-authorizations";
import type { crankerAuthorizationForWork, crankerExecutionPayload, verifiedPayloadForWork } from "../../../../work-contract";

import type { Dependencies } from "./dependencies";
import { crankerWorkView } from "./crankerWorkView";
import { errorStatus } from "./errorStatus";
export async function POST(dependencies: Pick<Dependencies, "NATIVE_REVERIFY_REASONS" | "NextResponse" | "attachCrankerAuthorization" | "authenticateCrankerRequest" | "crankerAuthorizationForWork" | "crankerExecutionPayload" | "enforceCrankerLeaseRateLimit" | "leaseForCranker" | "requestNodeAuthorization" | "retryLeasedSettlementFundingRoot" | "verifiedPayloadForWork">, request: NextRequest) {
    try {
        const bodyText = await request.text();
        const operator = await dependencies.authenticateCrankerRequest(request, bodyText, "POST", "/api/cranker/work");
        await dependencies.enforceCrankerLeaseRateLimit(operator);
        const body = JSON.parse(bodyText) as {
            supportedKinds?: Parameters<typeof leaseForCranker>[1];
        };
        let work = await dependencies.leaseForCranker(operator, body.supportedKinds);
        if (work && ["SETTLEMENT", "TCAP_EPOCH_ACCOUNTING"].includes(work.kind)) {
            const { configured, response } = await dependencies.requestNodeAuthorization("/internal/settlement-authorizations/settlement", { workId: work.id, crankerPubkey: operator });
            if (!configured)
                throw new Error("TSN Node authorization service is not configured");
            if (!response) {
                const native = work.kind !== "SETTLEMENT"
                    || work.verification?.verificationType === "TSN_TCAP_GPRU_HIDDEN_HEAD_V1";
                if (!native)
                    throw new Error("TSN Node authorization service is unavailable");
                const requeued = await dependencies.retryLeasedSettlementFundingRoot({
                    id: work.id, expectedVersion: work.stateVersion, owner: operator,
                    reason: "TSN_NODE_SIGNING_SERVICE_UNAVAILABLE", requestedBy: "authenticated-node-authorization",
                });
                return dependencies.NextResponse.json({ work: null, requeued });
            }
            if (!response.ok) {
                const detail = (await response.text()).slice(0, 500);
                let rejection: {
                    detail?: unknown;
                } = {};
                try {
                    rejection = JSON.parse(detail) as {
                        detail?: unknown;
                    };
                }
                catch { /* Unstructured failures remain errors. */ }
                if (response.status === 409 && typeof rejection.detail === "string" && dependencies.NATIVE_REVERIFY_REASONS.has(rejection.detail)) {
                    const requeued = await dependencies.retryLeasedSettlementFundingRoot({
                        id: work.id, expectedVersion: work.stateVersion, owner: operator, reason: String(rejection.detail), requestedBy: "authenticated-node-authorization",
                    });
                    return dependencies.NextResponse.json({ work: null, requeued });
                }
                return new dependencies.NextResponse(detail, { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
            }
            const authorization = dependencies.crankerAuthorizationForWork(work, await response.json() as Record<string, unknown>);
            work = await dependencies.attachCrankerAuthorization({ id: work.id, owner: operator, expectedVersion: work.stateVersion, authorization });
        }
        // The ingress payload may contain private routing identifiers required by
        // the Node. Crankers receive only the Node-verified, privacy-minimized view.
        return dependencies.NextResponse.json({ work: crankerWorkView(dependencies, work) });
    }
    catch (error) {
        return dependencies.NextResponse.json({ error: error instanceof Error ? error.message : "ERROR" }, { status: errorStatus(error) });
    }
}
