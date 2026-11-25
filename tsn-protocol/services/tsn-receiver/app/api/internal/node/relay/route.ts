export const runtime = "nodejs";
export const maxDuration = 180;
import { requireService } from "../../../../../lib/auth";
import { relayDependencies } from "../../../../../lib/node-relay/runtime";
import { relayHttp } from "../../../../../lib/node-relay/http";

const dependencies = { ...relayDependencies, requireService };
export const GET = relayHttp.bind(null, dependencies);
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
