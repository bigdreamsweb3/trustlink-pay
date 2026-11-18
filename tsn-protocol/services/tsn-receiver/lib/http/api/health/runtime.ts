import { NextResponse } from "next/server";
import { db } from "../../../firebase";
import { storage } from "./configuration";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { NextResponse, db, storage };
