import { NextRequest, NextResponse } from "next/server";

const forwardedHeaders = [
  "authorization",
  "content-type",
  "x-platform-key",
  "x-platform-signature",
];

export async function proxyNode(request: NextRequest, path: string) {
  const nodeUrl = process.env.TSN_NODE_URL;
  if (!nodeUrl) return NextResponse.json({ error: "TSN Node is unavailable" }, { status: 503 });
  const headers = new Headers();
  for (const name of forwardedHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const internalKey = process.env.TSN_RECEIVER_NODE_API_KEY;
  if (internalKey) headers.set("x-api-key", internalKey);
  const method = request.method;
  const response = await fetch(
    `${nodeUrl.replace(/\/$/, "")}/${path}${request.nextUrl.search}`,
    {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
    },
  );
  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
