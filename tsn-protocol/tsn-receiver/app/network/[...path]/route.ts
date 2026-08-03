import { NextRequest } from "next/server";
import { proxyNode } from "../../../lib/node-proxy";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
export const GET = async (request: NextRequest, context: Context) =>
  proxyNode(request, `network/${(await context.params).path.join("/")}`);
export const POST = GET;
