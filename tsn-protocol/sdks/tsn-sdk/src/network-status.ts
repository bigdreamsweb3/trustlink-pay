export type TsnServiceSource = "local" | "live" | "configured" | "none";
export type TsnServiceState = "online" | "degraded" | "offline" | "unknown";

export type TsnServiceStatus = {
  service: "node" | "receiver" | "rpc" | "cranker";
  /** Public architecture role; machine service names remain stable for compatibility. */
  role: "mother-node" | "receiver" | "rpc-gateway" | "cranker-node";
  state: TsnServiceState;
  source: TsnServiceSource;
  url: string | null;
  latencyMs: number | null;
  detail?: string;
};

export type TsnNetworkStatus = {
  checkedAt: string;
  services: TsnServiceStatus[];
  selected: Partial<Record<TsnServiceStatus["service"], { source: TsnServiceSource; url: string | null }>>;
  routeCount: number;
  onlineCrankers: number | null;
  /** Node, Receiver, and RPC are reachable for native Solana TSN actions. */
  readyForNativeTransactions: boolean;
  /** A registered settlement destination is also required for cross-chain actions. */
  readyForCrossChainTransactions: boolean;
  readyForTransactions: boolean;
};

export type TsnNetworkStatusOptions = {
  local?: Partial<Record<"node" | "receiver" | "rpc", string | null>>;
  live?: Partial<Record<"node" | "receiver" | "rpc", string | null>>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function clean(value: string | null | undefined) {
  return value?.trim().replace(/\/$/, "") || null;
}

async function probeHttp(url: string, options: { method?: "GET" | "POST"; body?: string; timeoutMs: number; fetchImpl: typeof fetch }) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetchImpl(url, {
      method: options.method ?? "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body,
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    return { ok: response.ok, status: response.status, body, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, status: 0, body: null, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

function status(service: TsnServiceStatus["service"], source: TsnServiceSource, url: string | null, result: Awaited<ReturnType<typeof probeHttp>>, detail?: string): TsnServiceStatus {
  const roleByService: Record<TsnServiceStatus["service"], TsnServiceStatus["role"]> = {
    node: "mother-node",
    receiver: "receiver",
    rpc: "rpc-gateway",
    cranker: "cranker-node",
  };
  return {
    service,
    role: roleByService[service],
    source,
    url,
    latencyMs: result.latencyMs,
    state: result.ok ? "online" : result.status >= 500 ? "degraded" : "offline",
    detail: detail ?? (result.ok ? undefined : result.error ?? `HTTP ${result.status}`),
  };
}

function serviceCandidates(local: string | null | undefined, live: string | null | undefined) {
  const entries: Array<["local" | "live", string]> = [];
  const localUrl = clean(local);
  const liveUrl = clean(live);
  if (localUrl) entries.push(["local", localUrl]);
  if (liveUrl) entries.push(["live", liveUrl]);
  return entries;
}

/**
 * Checks the TSN service dependencies. Node and Receiver may use local
 * endpoints first; Solana RPC is pinned to one configured gateway endpoint.
 * Cranker liveness is read from the Node route response because the Cranker
 * is a worker, not an HTTP service exposed to applications.
 */
export async function getTsnNetworkStatus(params: TsnNetworkStatusOptions = {}): Promise<TsnNetworkStatus> {
  const fetchImpl = (params.fetchImpl ?? globalThis.fetch).bind(globalThis) as typeof fetch;
  const timeoutMs = params.timeoutMs ?? 2500;
  const local = {
    node: clean(params.local?.node),
    receiver: clean(params.local?.receiver),
    rpc: clean(params.local?.rpc),
  };
  const live = {
    node: clean(params.live?.node),
    receiver: clean(params.live?.receiver),
    rpc: clean(params.live?.rpc),
  };
  const services: TsnServiceStatus[] = [];
  const selected: TsnNetworkStatus["selected"] = {};
  let nodeBody: Record<string, unknown> | null = null;

  for (const service of ["node", "receiver", "rpc"] as const) {
    let chosen: TsnServiceStatus | null = null;
    const candidates: Array<[TsnServiceSource, string]> = service === "rpc"
      ? (live.rpc ?? local.rpc) ? [["configured", (live.rpc ?? local.rpc)!]] : []
      : serviceCandidates(local[service], live[service]);
    for (const [source, base] of candidates) {
      const target = service === "node"
        ? `${base}/settlement-networks`
        : service === "receiver"
          ? `${base}/api/health`
          : base;
      const result = service === "rpc"
        ? await probeHttp(target, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }), timeoutMs, fetchImpl })
        : await probeHttp(target, { timeoutMs, fetchImpl });
      const body = result.body as Record<string, unknown> | null;
      const serviceOk = result.ok && (service !== "rpc" || body?.result === "ok");
      const normalized = serviceOk ? { ...result, ok: true } : { ...result, ok: false };
      const detail = service === "rpc" && !serviceOk ? "RPC health did not return result=ok" : undefined;
      chosen = status(service, source, base, normalized, detail);
      services.push(chosen);
      if (serviceOk) {
        selected[service] = { source, url: base };
        if (service === "node") nodeBody = body;
        break;
      }
    }
    if (!chosen || chosen.state !== "online") {
      if (!chosen) services.push({ service, role: service === "node" ? "mother-node" : service === "rpc" ? "rpc-gateway" : "receiver", source: "none", url: null, latencyMs: null, state: "unknown", detail: "No endpoint configured" });
      else selected[service] = { source: "none", url: null };
    }
  }

  const routes = Array.isArray(nodeBody?.value) ? nodeBody.value : [];
  const onlineCrankers = typeof nodeBody?.onlineCrankersLastEpoch === "number"
    ? nodeBody.onlineCrankersLastEpoch
    : typeof nodeBody?.online_crankers_last_epoch === "number" ? nodeBody.online_crankers_last_epoch : null;
  const nodeSelected = selected.node;
  const crankerState: TsnServiceState = onlineCrankers === null ? "unknown" : onlineCrankers > 0 ? "online" : "offline";
  services.push({ service: "cranker", role: "cranker-node", source: nodeSelected?.source ?? "none", url: nodeSelected?.url ?? null, latencyMs: null, state: crankerState, detail: onlineCrankers === null ? "Cranker Node discovery is observed when a Mother-DNA-authorized worker claims work" : `${onlineCrankers} Cranker Node(s) reported by the Node` });
  selected.cranker = { source: nodeSelected?.source ?? "none", url: nodeSelected?.url ?? null };

  // A Cranker is permissioned by Mother-DNA and becomes observable when it
  // accepts or processes authorized work. It is not a public availability
  // prerequisite for an application to create an authorization.
  const coreOnline = ["node", "receiver", "rpc"].every((service) => services.find((item) => item.service === service && item.state === "online"));
  const readyForNativeTransactions = coreOnline;
  const readyForCrossChainTransactions = coreOnline && routes.length > 0;
  return {
    checkedAt: new Date().toISOString(),
    services,
    selected,
    routeCount: routes.length,
    onlineCrankers,
    readyForNativeTransactions,
    readyForCrossChainTransactions,
    // Backward-compatible generic flag: native TSN actions may proceed when
    // their core settlement dependencies are reachable.
    readyForTransactions: readyForNativeTransactions,
  };
}
