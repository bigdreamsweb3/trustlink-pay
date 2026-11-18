import { NextResponse } from "next/server";
import { requireService } from "../../../../../../auth";
import { attachSignedFunding } from "../../../../../../store";
import type { Dependencies } from "./dependencies";

export const dependencies: Dependencies = { NextResponse, requireService, attachSignedFunding };
