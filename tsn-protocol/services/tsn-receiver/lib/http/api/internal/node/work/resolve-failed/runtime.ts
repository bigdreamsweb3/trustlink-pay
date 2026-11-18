import { NextResponse } from "next/server";
import { requireService } from "../../../../../../auth";
import { resolveFailedSettlement } from "../../../../../../failed-settlement-resolution";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, requireService, resolveFailedSettlement };
