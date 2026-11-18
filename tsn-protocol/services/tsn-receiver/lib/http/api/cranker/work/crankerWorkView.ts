/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { authenticateCrankerRequest, enforceCrankerLeaseRateLimit } from "../../../../cranker-auth";
import type { attachCrankerAuthorization, leaseForCranker, recordSettlementSubmission, retryLeasedSettlementFundingRoot, transition } from "../../../../store";
import type { reconcileExpiredCrankerConfirmation } from "../../../../settlement-reconciliation";
import type { NATIVE_REVERIFY_REASONS } from "../../../../settlement-retry";
import type { requestNodeAuthorization } from "../../../../node-authorizations";
import type { crankerAuthorizationForWork, crankerExecutionPayload, verifiedPayloadForWork } from "../../../../work-contract";

import type { Dependencies } from "./dependencies";

export function crankerWorkView(dependencies: Pick<Dependencies, "crankerExecutionPayload" | "verifiedPayloadForWork">, work: Awaited<ReturnType<typeof leaseForCranker>>) {
    if (!work)
        return null;
    const verifiedPayload = dependencies.verifiedPayloadForWork(work);
    // Funding work exposes only the already sender-signed transaction envelope
    // required for sponsorship. It never exposes the private Node payload,
    // recipient TIN, route map, commitment plaintext, or payment record fields.
    const executionPayload = verifiedPayload ? dependencies.crankerExecutionPayload(work.kind, verifiedPayload) : undefined;
    return {
        id: work.id, kind: work.kind, status: work.status, stateVersion: work.stateVersion,
        payloadCommitment: work.payloadCommitment,
        payload: {},
        receivedAt: work.receivedAt, updatedAt: work.updatedAt, crankerLease: work.crankerLease ?? null,
        verification: work.verification ? {
            verificationType: work.verification.verificationType ?? null,
            nodeAttestation: work.verification.nodeAttestation ?? null,
            ...(executionPayload && Object.keys(executionPayload).length ? { verifiedPayload: executionPayload } : {}),
        } : null,
        authorization: work.authorization ?? null,
        result: work.result ?? null,
    };
}
