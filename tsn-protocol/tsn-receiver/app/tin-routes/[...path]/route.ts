import { NextRequest } from "next/server";
import { proxyNode } from "../../../lib/node-proxy";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
const run = async (request: NextRequest, context: Context) =>
  proxyNode(request, `tin-routes/${(await context.params).path.join("/")}`);
export const GET = run;
export const POST = run;
export const DELETE = run;
