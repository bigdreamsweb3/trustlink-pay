import { NextResponse } from "next/server";
import { requireService } from "../../auth";
import { publicIntent } from "../../public-view";
import { listKind } from "../../store";
import { receive } from "../../store";
import type { Dependencies } from "./dependencies";
import { assertPaymentAuthorizationIngress } from "../../work-contract";
export const dependencies: Dependencies = { NextResponse, requireService, publicIntent, listKind, receive, assertPaymentAuthorizationIngress };
