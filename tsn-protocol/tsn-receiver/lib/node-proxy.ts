import { NextRequest, NextResponse } from "next/server";

const forwardedHeaders = [
  "authorization",
  "content-type",
  "x-platform-key",
  "x-platform-signature",
];

function cleanUrl(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, "");
}

export async function proxyNode(request: NextRequest, path: string) {
  const nodeUrls = [
    process.env.TSN_NODE_URL,
    process.env.TSN_NODE_FALLBACK_URL || "https://tsn-node.wasmer.app",
  ].filter(Boolean).map((value) => cleanUrl(value as string));
  const headers = new Headers();
  for (const name of forwardedHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const internalKey = process.env.TSN_RECEIVER_NODE_API_KEY;
  if (internalKey) headers.set("x-api-key", internalKey);
  const method = request.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();
  let response: Response | undefined;
  let lastError: unknown;
  for (const nodeUrl of [...new Set(nodeUrls)]) {
    try {
      response = await fetch(`${nodeUrl}/${path}${request.nextUrl.search}`, {
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
