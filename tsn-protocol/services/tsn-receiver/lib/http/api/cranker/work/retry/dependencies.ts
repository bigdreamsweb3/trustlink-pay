import type { NextRequest, NextResponse } from "next/server";
import type { authenticateCrankerRequest } from "../../../../../cranker-auth";
import type { retryLeasedSettlementFundingRoot } from "../../../../../store";
import type { NATIVE_REVERIFY_REASONS } from "../../../../../settlement-retry";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  authenticateCrankerRequest: typeof authenticateCrankerRequest;
  retryLeasedSettlementFundingRoot: typeof retryLeasedSettlementFundingRoot;
  NATIVE_REVERIFY_REASONS: typeof NATIVE_REVERIFY_REASONS;
}
