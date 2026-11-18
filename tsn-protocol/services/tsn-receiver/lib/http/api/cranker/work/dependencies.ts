import type { NextRequest, NextResponse } from "next/server";
import type { authenticateCrankerRequest, enforceCrankerLeaseRateLimit } from "../../../../cranker-auth";
import type { attachCrankerAuthorization, leaseForCranker, recordSettlementSubmission, retryLeasedSettlementFundingRoot, transition } from "../../../../store";
import type { reconcileExpiredCrankerConfirmation } from "../../../../settlement-reconciliation";
import type { NATIVE_REVERIFY_REASONS } from "../../../../settlement-retry";
import type { requestNodeAuthorization } from "../../../../node-authorizations";
import type { crankerAuthorizationForWork, crankerExecutionPayload, verifiedPayloadForWork } from "../../../../work-contract";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  authenticateCrankerRequest: typeof authenticateCrankerRequest;
  enforceCrankerLeaseRateLimit: typeof enforceCrankerLeaseRateLimit;
  attachCrankerAuthorization: typeof attachCrankerAuthorization;
  leaseForCranker: typeof leaseForCranker;
  recordSettlementSubmission: typeof recordSettlementSubmission;
  retryLeasedSettlementFundingRoot: typeof retryLeasedSettlementFundingRoot;
  transition: typeof transition;
  reconcileExpiredCrankerConfirmation: typeof reconcileExpiredCrankerConfirmation;
  NATIVE_REVERIFY_REASONS: typeof NATIVE_REVERIFY_REASONS;
  requestNodeAuthorization: typeof requestNodeAuthorization;
  crankerAuthorizationForWork: typeof crankerAuthorizationForWork;
  crankerExecutionPayload: typeof crankerExecutionPayload;
  verifiedPayloadForWork: typeof verifiedPayloadForWork;
}
