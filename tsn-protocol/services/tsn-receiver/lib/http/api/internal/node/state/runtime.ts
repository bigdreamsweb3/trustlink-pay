import { NextResponse } from "next/server";
import { requireService } from "../../../../../auth";
import { executeStateOperation } from "../../../../../node-state-store";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, requireService, executeStateOperation };
