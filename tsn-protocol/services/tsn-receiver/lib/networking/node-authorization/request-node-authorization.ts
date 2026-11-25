import type { AuthorizationPath } from "./configuration";
import type { RelayRequest } from "../../node-relay/types";

/** The only Node transport is a durable outbound-consumed request; no Node URL is used. */
export async function requestNodeAuthorization(dependencies: { environment: NodeJS.ProcessEnv; request: (request: RelayRequest) => Promise<Response> }, path: AuthorizationPath, body: Record<string, unknown>) {
  if (!dependencies.environment.TSN_RECEIVER_NODE_API_KEY || !dependencies.environment.TSN_NODE_VERIFICATION_PUBLIC_KEY) return { configured: false, response: null, nodeStatus: undefined };
  try {
    const response = await dependencies.request({ method: "POST", path, search: "", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (response.status >= 500) return { configured: true, response: null, nodeStatus: response.status };
    return { configured: true, response, nodeStatus: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "NODE_RELAY_WORK_NOT_FOUND") return { configured: true, response: new Response(JSON.stringify({ detail: "Receiver work was not found" }), {status:404}), nodeStatus: undefined };
    return { configured: true, response: null, nodeStatus: undefined };
  }
}
