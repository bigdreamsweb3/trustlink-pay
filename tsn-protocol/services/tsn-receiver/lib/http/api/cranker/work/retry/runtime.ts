import { NextResponse } from "next/server";
import { authenticateCrankerRequest } from "../../../../../cranker-auth";
import { retryLeasedSettlementFundingRoot } from "../../../../../store";
import { NATIVE_REVERIFY_REASONS } from "../../../../../settlement-retry";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, authenticateCrankerRequest, retryLeasedSettlementFundingRoot, NATIVE_REVERIFY_REASONS };
