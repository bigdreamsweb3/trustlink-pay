import { getAuth } from "firebase-admin/auth";
import { NextResponse } from "next/server";
import { authenticateCrankerRequest } from "../../../../cranker-auth";
import { app } from "../../../../firebase";
import type { Dependencies } from "./dependencies";
export const dependencies: Dependencies = { getAuth, NextResponse, authenticateCrankerRequest, app };
