import type { Dependencies } from "./dependencies";
import { hasConfiguredNodeUrl } from "../common/has-configured-node-url";
import { cleanNodeUrl } from "../common/clean-node-url";
import { isFirstNodeUrl } from "./is-first-node-url";
import { abortWakeRequest } from "./abort-wake-request";

/** wakeTsnNode component. Inputs and results retain the original node-wake contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function wakeTsnNode(dependencies: Pick<Dependencies, "environment" | "fetch">, reason: string): Promise<void> {
  const apiKey = dependencies.environment.TSN_RECEIVER_NODE_API_KEY?.trim();
  const urls = [dependencies.environment.TSN_NODE_URL, dependencies.environment.TSN_NODE_FALLBACK_URL]
    .filter(hasConfiguredNodeUrl)
    .map(cleanNodeUrl)
    .filter(isFirstNodeUrl);
  if (!apiKey || urls.length === 0) return;

  const timeoutMs = Math.max(250, Number(dependencies.environment.TSN_NODE_WAKE_TIMEOUT_MS ?? 2500));
  let lastError: unknown;
  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(abortWakeRequest.bind(null, { controller }), timeoutMs);
    try {
      const response = await dependencies.fetch(`${url}/internal/wake`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ reason: reason.slice(0, 64) }),
        signal: controller.signal,
      });
      if (response.ok) return;
      lastError = new Error(`TSN Node wake returned ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  // Work is already durable in Firebase. A failed hint must never fail the
  // client submission; the Node will wake on its next explicit notification.
  console.warn("TSN Node wake notification failed", {
    reason: reason.slice(0, 64),
    error: lastError instanceof Error ? lastError.message : "unknown",
  });
}
