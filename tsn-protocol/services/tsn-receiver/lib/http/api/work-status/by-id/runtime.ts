import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getWork } from "../../../../store";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, createHash, getWork };
