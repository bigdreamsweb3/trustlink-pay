import { NextResponse, type NextRequest } from "next/server";
import { claimRelayJob } from "./claim";
import { completeRelayJob } from "./complete";
import { renewRelayJob } from "./renew";
import { syncLocalNode } from "./sync";
import { cleanupRelayJobs } from "./cleanup";
import type { RelayDependencies } from "./types";

/** All relay operations require the existing Node service credential; raw dependency errors never enter responses. */
export async function relayHttp(dependencies: RelayDependencies & { requireService: (request: NextRequest, actor: "node") => void }, request: NextRequest) {
  try {
    dependencies.requireService(request, "node");
    if (request.method === "GET") {
      await cleanupRelayJobs(dependencies);
      return NextResponse.json(await syncLocalNode(dependencies, request.nextUrl.searchParams.get("epoch") ?? "", Number(request.nextUrl.searchParams.get("cursor") ?? 0)));
    }
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("NODE_RELAY_BODY_INVALID");
    if (request.method === "POST") return NextResponse.json({ job: await claimRelayJob(dependencies, body.owner, body.lane) });
    if (!Number.isSafeInteger(body.version) || body.version < 1 || !/^[0-9a-f]{64}$/.test(body.requestHash)) throw new Error("NODE_RELAY_BODY_INVALID");
    if (request.method === "PUT") return NextResponse.json(await renewRelayJob(dependencies, body.id, body.owner, body.version, body.requestHash));
    if (request.method === "PATCH") return NextResponse.json(await completeRelayJob(dependencies, body.id, body.owner, body.version, body.requestHash, body.reply));
    return NextResponse.json({ error: "NODE_RELAY_METHOD_INVALID" }, { status: 405 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "NODE_RELAY_UNAVAILABLE";
    const status = message === "UNAUTHORIZED_SERVICE" ? 401 : /INVALID|CONFLICT|NOT_FOUND|FULL/.test(message) ? 409 : 503;
    const safe = /^[A-Z][A-Z0-9_]{0,79}$/.test(message) ? message : "NODE_RELAY_UNAVAILABLE";
    return NextResponse.json({ error: safe }, { status });
  }
}
