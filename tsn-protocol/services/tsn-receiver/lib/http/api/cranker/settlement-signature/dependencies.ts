import type { NextRequest, NextResponse } from "next/server";
import type { authenticateCrankerRequest, enforceCrankerLeaseRateLimit } from "../../../../cranker-auth";
import type { requestNodeAuthorization } from "../../../../node-authorizations";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  authenticateCrankerRequest: typeof authenticateCrankerRequest;
  enforceCrankerLeaseRateLimit: typeof enforceCrankerLeaseRateLimit;
  requestNodeAuthorization: typeof requestNodeAuthorization;
}
