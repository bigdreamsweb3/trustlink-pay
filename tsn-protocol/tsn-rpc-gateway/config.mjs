const FALLBACK_PORT = 8787;
const DEFAULT_WS_PATH = "/ws";
const FALLBACK_TIMEOUT_MS = 4_500;
const FALLBACK_PROBE_INTERVAL_MS = 60_000;
const FALLBACK_PROBE_TIMEOUT_MS = 2_500;
const FALLBACK_DASHBOARD_REFRESH_MS = 5_000;
const DEFAULT_SOLANA_RPC_URLS = [
  "https://api.devnet.solana.com",
];
const DEFAULT_ALLOWED_ORIGINS = [
  "https://trustlink-pay.vercel.app",
  "https://trustlink-pay-backend.vercel.app",
  "https://tsn-node.wasmer.app",
  "https://tsn-receiver-kappa.vercel.app",
  "http://localhost:3001",
  "http://localhost:3000",
];

const ENV_KEYS = [
  "TSN_SOLANA_RPC_UPSTREAM_URLS",
  "TSN_SOLANA_RPC_UPSTREAM_URL",
  "TSN_SOLANA_RPC_URLS",
  "TSN_SOLANA_RPC_URL",
  "SOLANA_RPC_URL",
];

const WS_ENV_KEYS = [
  "TSN_SOLANA_WS_UPSTREAM_URLS",
  "TSN_SOLANA_WS_UPSTREAM_URL",
  "TSN_SOLANA_WS_URLS",
  "TSN_SOLANA_WS_URL",
  "SOLANA_WS_UPSTREAM_URLS",
  "SOLANA_WS_UPSTREAM_URL",
];

function readEnv(source, name) {
  if (!source) return undefined;
  if (typeof source.get === "function") {
    return source.get(name) ?? undefined;
  }
  return source[name] ?? undefined;
}

function normalizeRpcUrl(value) {
  return String(value).trim().replace(/\/+$/, "");
}

function splitRpcUrlList(value) {
  return String(value ?? "")
    .split(/[,\s]+/g)
    .map((entry) => normalizeRpcUrl(entry))
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function collectUrls(source) {
  const urls = [];
  for (const key of ENV_KEYS) {
    const value = readEnv(source, key);
    if (!value) continue;
    urls.push(...splitRpcUrlList(String(value)));
  }
  return unique(urls.map((entry) => normalizeRpcUrl(entry)));
}

function collectWsUrls(source) {
  const urls = [];
  for (const key of WS_ENV_KEYS) {
    const value = readEnv(source, key);
    if (!value) continue;
    urls.push(...splitRpcUrlList(String(value)));
  }
  return unique(urls.map((entry) => normalizeRpcUrl(entry)));
}

function parsePort(source) {
  const rawPort = Number(
    readEnv(source, "TSN_RPC_GATEWAY_PORT") ?? readEnv(source, "PORT"),
  );
  return Number.isFinite(rawPort) && rawPort > 0 ? rawPort : FALLBACK_PORT;
}

function parseWebSocketPath(source) {
  const value = String(readEnv(source, "TSN_RPC_GATEWAY_WS_PATH") ?? DEFAULT_WS_PATH).trim();
  if (!value.startsWith("/") || value.includes("://") || value.includes("..")) {
    throw new Error("TSN_RPC_GATEWAY_WS_PATH must be an absolute local path");
  }
  return value;
}

function parseAllowedOrigins(source) {
  const configured = unique(
    String(readEnv(source, "TSN_RPC_GATEWAY_ALLOWED_ORIGINS") ?? "")
      .split(/[\s,]+/g)
      .map((value) => value.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  );
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function parseBoolean(source, name) {
  return String(readEnv(source, name) ?? "").trim().toLowerCase() === "true";
}

function parseTimeoutMs(source) {
  const rawTimeout = Number(readEnv(source, "TSN_RPC_PROVIDER_TIMEOUT_MS"));
  return Number.isFinite(rawTimeout) && rawTimeout >= 1_000
    ? rawTimeout
    : FALLBACK_TIMEOUT_MS;
}

function parseProbeIntervalMs(source) {
  const rawInterval = Number(readEnv(source, "TSN_RPC_GATEWAY_PROBE_INTERVAL_MS"));
  return Number.isFinite(rawInterval) && rawInterval >= 10_000
    ? rawInterval
    : FALLBACK_PROBE_INTERVAL_MS;
}

function parseProbeTimeoutMs(source) {
  const rawTimeout = Number(readEnv(source, "TSN_RPC_GATEWAY_PROBE_TIMEOUT_MS"));
  return Number.isFinite(rawTimeout) && rawTimeout >= 500
    ? rawTimeout
    : FALLBACK_PROBE_TIMEOUT_MS;
}

function parseDashboardRefreshMs(source) {
  const rawRefresh = Number(readEnv(source, "TSN_RPC_GATEWAY_DASHBOARD_REFRESH_MS"));
  return Number.isFinite(rawRefresh) && rawRefresh >= 1_000
    ? rawRefresh
    : FALLBACK_DASHBOARD_REFRESH_MS;
}

function labelForUrl(url, index) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    return `${parsed.hostname}${pathname}`;
  } catch {
    return `provider-${index + 1}`;
  }
}

function deriveWsUrl(httpUrl) {
  try {
    const parsed = new URL(httpUrl);
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return parsed.toString();
  } catch {
    return httpUrl;
  }
}

export function redactRpcUrlForDisplay(url) {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      parsed.searchParams.set(key, "redacted");
    }
    return parsed.toString();
  } catch {
    return normalizeRpcUrl(url).replace(/\?.*$/, "?redacted");
  }
}

export function getRpcGatewayConfig(source = globalThis?.process?.env ?? {}) {
  const upstreamUrls = collectUrls(source);
  const upstreamWsUrls = collectWsUrls(source);
  // Keep the official public Devnet endpoint as a bounded fallback when a
  // configured provider is unavailable. Private providers must be explicitly
  // configured; removing one from the environment must remove it from the
  // runtime pool as well.
  const urls = unique([...upstreamUrls, ...DEFAULT_SOLANA_RPC_URLS]);
  return {
    port: parsePort(source),
    webSocketPath: parseWebSocketPath(source),
    allowedOrigins: parseAllowedOrigins(source),
    allowAnyOrigin: parseBoolean(source, "TSN_RPC_GATEWAY_ALLOW_ANY_ORIGIN"),
    timeoutMs: parseTimeoutMs(source),
    probeIntervalMs: parseProbeIntervalMs(source),
    probeTimeoutMs: parseProbeTimeoutMs(source),
    dashboardRefreshMs: parseDashboardRefreshMs(source),
    mode: String(readEnv(source, "TSN_RPC_GATEWAY_MODE") ?? "balanced").toLowerCase(),
    logLevel: String(readEnv(source, "TSN_RPC_GATEWAY_LOG_LEVEL") ?? "info").toLowerCase(),
    upstreams: urls.map((url, index) => ({
      id: `provider-${index + 1}`,
      label: labelForUrl(url, index),
      url,
      wsUrl: upstreamWsUrls[index] ? normalizeRpcUrl(upstreamWsUrls[index]) : deriveWsUrl(url),
      displayUrl: redactRpcUrlForDisplay(url),
      displayWsUrl: redactRpcUrlForDisplay(
        upstreamWsUrls[index] ? normalizeRpcUrl(upstreamWsUrls[index]) : deriveWsUrl(url),
      ),
    })),
  };
}
