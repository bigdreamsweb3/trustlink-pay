import { NextResponse } from "next/server";
import { requireService } from "../../../../../auth";
import { getWorkForNode } from "../../../../../store";
import { leaseForNode } from "../../../../../store";
import { renewNodeLease } from "../../../../../store";
import { transition } from "../../../../../store";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, requireService, getWorkForNode, leaseForNode, renewNodeLease, transition };
