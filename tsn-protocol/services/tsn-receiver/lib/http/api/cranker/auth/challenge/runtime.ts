import { NextResponse } from "next/server";
import { issueCrankerChallenge } from "../../../../../cranker-auth";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, issueCrankerChallenge };
