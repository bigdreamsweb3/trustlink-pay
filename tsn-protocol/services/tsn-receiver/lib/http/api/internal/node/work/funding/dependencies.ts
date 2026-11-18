import type { NextResponse } from "next/server";
import type { requireService } from "../../../../../../auth";
import type { attachSignedFunding } from "../../../../../../store";

/** The internal route owns authorization and delegates atomic storage to the work component. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  requireService: typeof requireService;
  attachSignedFunding: typeof attachSignedFunding;
}
