import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../../../../auth";
import type { getWorkForNode, leaseForNode, renewNodeLease, transition } from "../../../../../store";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  requireService: typeof requireService;
  getWorkForNode: typeof getWorkForNode;
  leaseForNode: typeof leaseForNode;
  renewNodeLease: typeof renewNodeLease;
  transition: typeof transition;
}
