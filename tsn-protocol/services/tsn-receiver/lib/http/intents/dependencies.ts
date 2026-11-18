import type { NextRequest, NextResponse } from "next/server";
import type { requireService } from "../../auth";
import type { publicIntent } from "../../public-view";
import type { listKind, receive } from "../../store";
import type { assertPaymentAuthorizationIngress } from "../../work-contract";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  requireService: typeof requireService;
  publicIntent: typeof publicIntent;
  listKind: typeof listKind;
  receive: typeof receive;
  assertPaymentAuthorizationIngress: typeof assertPaymentAuthorizationIngress;
}
