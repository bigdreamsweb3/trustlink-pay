import { NextResponse } from "next/server";
import { requireService } from "../../../../../../auth";
import { reconcileSettlementReceipt } from "../../../../../../settlement-reconciliation";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, requireService, reconcileSettlementReceipt };
