import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../../auth";
import type { reconcileSettlementReceipt } from "../../../../../../settlement-reconciliation";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  requireService: typeof requireService;
  reconcileSettlementReceipt: typeof reconcileSettlementReceipt;
}
