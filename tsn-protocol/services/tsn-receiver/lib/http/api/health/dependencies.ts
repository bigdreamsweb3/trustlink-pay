import type { NextResponse } from "next/server";
import type { db } from "../../../database";
import type { storage } from "./configuration";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  NextResponse: typeof NextResponse;
  db: typeof db;
  storage: typeof storage;
}
