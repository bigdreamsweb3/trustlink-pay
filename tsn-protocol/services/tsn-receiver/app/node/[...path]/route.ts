export const runtime = "nodejs";
export const maxDuration = 180;
import { proxyNode } from "../../../lib/node-proxy";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyNode(request, (await context.params).path.join("/"));
}
export const POST = GET;
export const PATCH = GET;
