import type { Dependencies } from "./dependencies";
import { hasConfiguredNodeUrl } from "../common/has-configured-node-url";
import { cleanNodeUrl } from "../common/clean-node-url";
import { AuthorizationPath } from "./configuration";

/** requestNodeAuthorization component. Inputs and results retain the original node-authorizations contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function requestNodeAuthorization(dependencies: Pick<Dependencies, "environment" | "fetch">, path: AuthorizationPath, body: Record<string, unknown>) {
  const key = dependencies.environment.TSN_RECEIVER_NODE_API_KEY;
  const urls = [...new Set([dependencies.environment.TSN_NODE_URL, dependencies.environment.TSN_NODE_FALLBACK_URL]
    .filter(hasConfiguredNodeUrl)
    .map(cleanNodeUrl))];
  if (!key || !urls.length) return { configured: false, response: null, nodeStatus: undefined };
  let nodeStatus: number | undefined;
  for (const url of urls) {
    try {
      const response = await dependencies.fetch(`${url}${path}`, {
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
