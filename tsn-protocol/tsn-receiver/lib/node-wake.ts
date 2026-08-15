const cleanUrl = (value: string) => value.trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, "");

/**
 * Wake the TSN Node after durable work has been written. This is a control
 * notification only: it carries no work payload or user data. The Node then
 * reads the authenticated Receiver queue and drains eligible work itself.
 */
export async function wakeTsnNode(reason: string): Promise<void> {
  const apiKey = process.env.TSN_RECEIVER_NODE_API_KEY?.trim();
  const urls = [process.env.TSN_NODE_URL, process.env.TSN_NODE_FALLBACK_URL]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(cleanUrl)
    .filter((value, index, all) => all.indexOf(value) === index);
  if (!apiKey || urls.length === 0) return;

  const timeoutMs = Math.max(250, Number(process.env.TSN_NODE_WAKE_TIMEOUT_MS ?? 2500));
  let lastError: unknown;
  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${url}/internal/wake`, {
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
