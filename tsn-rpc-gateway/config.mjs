const FALLBACK_PORT = 8787;
const FALLBACK_TIMEOUT_MS = 4_500;
const DEFAULT_SOLANA_RPC_URL = "https://api.devnet.solana.com";

const ENV_KEYS = [
  "TSN_SOLANA_RPC_UPSTREAM_URLS",
  "TSN_SOLANA_RPC_UPSTREAM_URL",
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

function parsePort(source) {
  const rawPort = Number(readEnv(source, "TSN_RPC_GATEWAY_PORT"));
  return Number.isFinite(rawPort) && rawPort > 0 ? rawPort : FALLBACK_PORT;
}

function parseTimeoutMs(source) {
  const rawTimeout = Number(readEnv(source, "TSN_RPC_PROVIDER_TIMEOUT_MS"));
  return Number.isFinite(rawTimeout) && rawTimeout >= 1_000
    ? rawTimeout
    : FALLBACK_TIMEOUT_MS;
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
  const urls = upstreamUrls.length > 0 ? upstreamUrls : [DEFAULT_SOLANA_RPC_URL];
  return {
    port: parsePort(source),
    timeoutMs: parseTimeoutMs(source),
    mode: String(readEnv(source, "TSN_RPC_GATEWAY_MODE") ?? "balanced").toLowerCase(),
    upstreams: urls.map((url, index) => ({
      id: `provider-${index + 1}`,
      label: labelForUrl(url, index),
      url,
      displayUrl: redactRpcUrlForDisplay(url),
    })),
  };
}
