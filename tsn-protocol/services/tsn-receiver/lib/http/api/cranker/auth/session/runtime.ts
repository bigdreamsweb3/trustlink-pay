import { NextResponse } from "next/server";
import { issueCrankerSession } from "../../../../../cranker-auth";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, issueCrankerSession };
