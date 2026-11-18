import { NextResponse } from "next/server";
import { receive } from "../../store";
import { publicCoordinationPayload } from "../../work-contract";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, receive, publicCoordinationPayload };
