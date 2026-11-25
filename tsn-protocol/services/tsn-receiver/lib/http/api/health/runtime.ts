import { NextResponse } from "next/server";
import { db } from "../../../database";
import { storage } from "./configuration";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, db, storage };
