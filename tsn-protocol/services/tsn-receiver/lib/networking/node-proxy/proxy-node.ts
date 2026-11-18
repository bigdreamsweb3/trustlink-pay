import type { Dependencies } from "./dependencies";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hasConfiguredNodeUrl } from "../common/has-configured-node-url";
import { cleanNodeUrl } from "../common/clean-node-url";
import { forwardedHeaders } from "./configuration";

/** proxyNode component. Inputs and results retain the original node-proxy contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function proxyNode(dependencies: Pick<Dependencies, "environment" | "fetch">, request: NextRequest, path: string) {
  const nodeUrls = [dependencies.environment.TSN_NODE_URL, dependencies.environment.TSN_NODE_FALLBACK_URL]
    .filter(hasConfiguredNodeUrl)
    .map(cleanNodeUrl);
  const headers = new Headers();
  for (const name of forwardedHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const internalKey = dependencies.environment.TSN_RECEIVER_NODE_API_KEY;
  if (internalKey) headers.set("x-api-key", internalKey);
  const method = request.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();
  let response: Response | undefined;
  let lastError: unknown;
  for (const nodeUrl of [...new Set(nodeUrls)]) {
    try {
      response = await dependencies.fetch(`${nodeUrl}/${path}${request.nextUrl.search}`, {
        method, headers, body, cache: "no-store",
      });
      if (response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!response) return NextResponse.json({ error: "TSN Node is unavailable", detail: String(lastError ?? "") }, { status: 503 });
  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
