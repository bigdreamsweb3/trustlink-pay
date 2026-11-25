import { NextResponse, type NextRequest } from "next/server";
import { forwardedHeaders } from "./configuration";
import type { RelayRequest } from "../../node-relay/types";

/** Forward application data through Receiver storage; never connect to an inbound Node listener. */
export async function proxyNode(dependencies: { requireService: (request: NextRequest, actor: "node") => void; request: (request: RelayRequest, retryId?: string) => Promise<Response> }, request: NextRequest, path: string) {
  try {
    if ((request.method === "GET" && ["intents", "intent-work"].includes(path)) || request.method === "PATCH") dependencies.requireService(request, "node");
    if (path.startsWith("internal/")) return NextResponse.json({ error: "NODE_RELAY_PATH_FORBIDDEN" }, {status:403});
    const headers: Record<string,string> = {};
    for (const name of forwardedHeaders) { const value = request.headers.get(name); if (value) headers[name] = value; }
    const response = await dependencies.request({ method: request.method, path: "/"+path, search: request.nextUrl.search, headers,
      body: request.method === "GET" ? null : await request.text() }, request.headers.get("x-tsn-relay-id") ?? undefined);
    return new NextResponse(response.body, { status: response.status, headers: response.headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "NODE_RELAY_UNAVAILABLE";
    const safe = /^[A-Z][A-Z0-9_]{0,79}$/.test(message) ? message : "NODE_RELAY_UNAVAILABLE";
    return NextResponse.json({ error:safe }, {status: message === "UNAUTHORIZED_SERVICE" ? 401 : /INVALID|CONFLICT|FULL/.test(message) ? 409 : 503});
  }
}
