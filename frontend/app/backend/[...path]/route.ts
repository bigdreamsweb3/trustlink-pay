import { NextRequest, NextResponse } from "next/server";

const backendUrl = process.env.BACKEND_URL?.replace(/\/+$/, "");

function buildTargetUrl(path: string[], request: NextRequest) {
  if (!backendUrl) {
    throw new Error("BACKEND_URL is not configured");
  }

  if (path.length === 0 || path[0] !== "api") {
    throw new Error("Invalid backend path");
  }

  const target = new URL(`${backendUrl}/${path.join("/")}`);
  target.search = request.nextUrl.search;
  return target;
}

function buildHeaders(request: NextRequest) {
  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");

  if (authorization) {
    headers.set("authorization", authorization);
  }

  if (contentType) {
    headers.set("content-type", contentType);
  }

  if (accept) {
    headers.set("accept", accept);
  }

  return headers;
}

async function forwardRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params;
    const target = buildTargetUrl(path, request);
    const method = request.method;
    const headers = buildHeaders(request);
    const init: RequestInit = {
      method,
      headers,
      cache: "no-store",
      body: method === "GET" || method === "HEAD" ? undefined : await request.text(),
    };

    const response = await fetch(target, init);
    const responseHeaders = new Headers();
    const contentType = response.headers.get("content-type");

    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy request failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = forwardRequest;
export const POST = forwardRequest;
export const PATCH = forwardRequest;
export const DELETE = forwardRequest;
