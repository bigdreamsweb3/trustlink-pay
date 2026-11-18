import type { getAuth } from "firebase-admin/auth";
import type { NextRequest, NextResponse } from "next/server";
import type { authenticateCrankerRequest } from "../../../../cranker-auth";
import type { app } from "../../../../firebase";
/** Narrow request ports; the route composition owns their real implementations. */
export interface Dependencies {
  getAuth: typeof getAuth;
  NextResponse: typeof NextResponse;
  authenticateCrankerRequest: typeof authenticateCrankerRequest;
  app: typeof app;
}
