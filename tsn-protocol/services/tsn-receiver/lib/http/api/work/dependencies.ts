import type { NextRequest, NextResponse } from "next/server";
import type { listRecent, receive } from "../../../store";
import type { assertExternalWorkKind, publicCoordinationPayload, ReceiverWork, WorkKind } from "../../../work-contract";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  listRecent: typeof listRecent;
  receive: typeof receive;
  assertExternalWorkKind: typeof assertExternalWorkKind;
  publicCoordinationPayload: typeof publicCoordinationPayload;
}
