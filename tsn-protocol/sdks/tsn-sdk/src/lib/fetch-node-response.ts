/** Resume only the same durable Node request when Receiver reports pending work. */
export async function fetchNodeResponse(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(url, { ...init, headers });
    const identifier = response.headers.get("x-tsn-relay-id");
    if (response.status !== 503 || !identifier || !/^[0-9a-f]{64}$/.test(identifier) || attempt >= 2) return response;
    let body: unknown;
    try { body = await response.clone().json(); } catch { return response; }
    if (!body || typeof body !== "object" || (body as {error?: unknown}).error !== "NODE_RELAY_PENDING") return response;
    headers.set("x-tsn-relay-id", identifier);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
