import { NextRequest } from "next/server";
import { proxyNode } from "../../../lib/node-proxy";

export const runtime = "nodejs";

type Context = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxyNode(request, `tin-operations/${path.join("/")}`);
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
