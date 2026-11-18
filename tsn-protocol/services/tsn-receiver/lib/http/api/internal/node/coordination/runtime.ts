import { NextResponse } from "next/server";
import { requireService } from "../../../../../auth";
import { coordinationInventory } from "../../../../../private-credit-coordination";
import { enqueueCoordination } from "../../../../../private-credit-coordination";
import { deferPrivateCredit } from "../../../../../private-credit-coordination";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, requireService, coordinationInventory, enqueueCoordination, deferPrivateCredit };
