import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../auth";
import type { coordinationInventory, enqueueCoordination, deferPrivateCredit } from "../../../../../private-credit-coordination";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  requireService: typeof requireService;
  coordinationInventory: typeof coordinationInventory;
  enqueueCoordination: typeof enqueueCoordination;
  deferPrivateCredit: typeof deferPrivateCredit;
}
