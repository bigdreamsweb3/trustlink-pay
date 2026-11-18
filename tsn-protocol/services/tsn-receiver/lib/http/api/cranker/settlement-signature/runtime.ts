import { NextResponse } from "next/server";
import { authenticateCrankerRequest } from "../../../../cranker-auth";
import { enforceCrankerLeaseRateLimit } from "../../../../cranker-auth";
import { requestNodeAuthorization } from "../../../../node-authorizations";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, authenticateCrankerRequest, enforceCrankerLeaseRateLimit, requestNodeAuthorization };
