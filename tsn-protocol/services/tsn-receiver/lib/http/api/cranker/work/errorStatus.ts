/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest, NextResponse } from "next/server";
import type { authenticateCrankerRequest, enforceCrankerLeaseRateLimit } from "../../../../cranker-auth";
import type { attachCrankerAuthorization, leaseForCranker, recordSettlementSubmission, retryLeasedSettlementFundingRoot, transition } from "../../../../store";
import type { reconcileExpiredCrankerConfirmation } from "../../../../settlement-reconciliation";
import type { NATIVE_REVERIFY_REASONS } from "../../../../settlement-retry";
import type { requestNodeAuthorization } from "../../../../node-authorizations";
import type { crankerAuthorizationForWork, crankerExecutionPayload, verifiedPayloadForWork } from "../../../../work-contract";


export function errorStatus(error: unknown) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "UNAUTHORIZED_SERVICE")
        return 401;
    if (message.includes("CRANKER_SIGNATURE") || message.includes("CRANKER_PUBLIC_KEY") || message.includes("CRANKER_MOTHER") || message.includes("CRANKER_OPERATOR") || message.includes("CRANKER_ACCOUNT") || message.includes("CRANKER_SESSION") || message.includes("CRANKER_REQUEST") || message.includes("CHALLENGE") || message.includes("REQUEST_EXPIRED"))
        return 401;
    if (message.includes("RATE_LIMITED"))
        return 429;
    if (/fetch failed|ECONNRESET|network|timeout|temporarily unavailable/i.test(message))
        return 503;
    if (message.includes("authorization service is unavailable"))
        return 503;
    return 409;
}
