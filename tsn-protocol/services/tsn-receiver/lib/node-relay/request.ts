import { enqueueRelayRequest } from "./enqueue";
import { waitRelayReply } from "./wait-reply";
import type { RelayDependencies, RelayRequest } from "./types";

/** Canonical Receiver-to-Node transport: durable requests, never an inbound Node URL. */
export async function requestLocalNode(dependencies: RelayDependencies, request: RelayRequest, retryId?: string): Promise<Response> {
  const job = await enqueueRelayRequest(dependencies, request, retryId);
  const waitMs = request.path.startsWith("/internal/") ? Math.max(0, Math.min(120000, Date.parse(job.expiresAt) - dependencies.clock.now())) : 20000;
  const reply = await waitRelayReply(dependencies, job.id, job.requestHash, waitMs);
  return reply ?? new Response(JSON.stringify({ error: "NODE_RELAY_PENDING", relayId: job.id }),
    { status: 503, headers: { "content-type": "application/json", "retry-after": "2", "x-tsn-relay-id": job.id, "cache-control": "no-store" } });
}
