import { NextResponse } from "next/server";
import { listRecent } from "../../../store";
import { receive } from "../../../store";
import { assertExternalWorkKind } from "../../../work-contract";
import { publicCoordinationPayload } from "../../../work-contract";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, listRecent, receive, assertExternalWorkKind, publicCoordinationPayload };
