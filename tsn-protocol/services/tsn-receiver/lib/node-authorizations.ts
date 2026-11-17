type AuthorizationPath = "/internal/settlement-authorizations/settlement" | "/internal/settlement-authorizations/signature";

/** Preserve Node's work lookup rejection; a missing route is an availability failure. */
export async function requestNodeAuthorization(path: AuthorizationPath, body: Record<string, unknown>) {
  const key = process.env.TSN_RECEIVER_NODE_API_KEY;
  const urls = [...new Set([process.env.TSN_NODE_URL, process.env.TSN_NODE_FALLBACK_URL]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(value => value.trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, "")))];
  if (!key || !urls.length) return { configured: false, response: null, nodeStatus: undefined };
  let nodeStatus: number | undefined;
  for (const url of urls) {
    try {
      const response = await fetch(`${url}${path}`, {
        method: "POST", headers: { "content-type": "application/json", "x-api-key": key },
        body: JSON.stringify(body), cache: "no-store",
      });
      // A connection can fail after headers; body delivery belongs to this attempt.
      const text = await response.text();
      if (response.status === 404) {
        let rejection: unknown;
        try { rejection = JSON.parse(text); } catch { /* A non-Node 404 is unavailable. */ }
        if (rejection && typeof rejection === "object" && !Array.isArray(rejection)
            && (rejection as Record<string, unknown>).detail === "Receiver work was not found") {
          return { configured: true, response: new Response(text, { status: 404, headers: response.headers }), nodeStatus: undefined };
        }
      } else if (response.status < 500) {
        return { configured: true, response: new Response(text || null, {
          status: response.status, headers: response.headers,
        }), nodeStatus: undefined };
      }
      nodeStatus = response.status;
    } catch {
      // URLs, credentials and dependency messages never enter public diagnostics.
      nodeStatus = undefined;
    }
  }
  return { configured: true, response: null, nodeStatus };
}
