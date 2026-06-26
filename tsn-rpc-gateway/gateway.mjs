import { getRpcGatewayConfig, redactRpcUrlForDisplay } from "./config.mjs";
import { createProviderPool } from "./provider-pool.mjs";

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function textResponse(text, status = 200, headers = {}) {
  return new Response(text, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...headers,
    },
  });
}

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return controller.signal;
}

function isJsonObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonBody(text) {
  if (!text.trim()) {
    throw new Error("RPC request body is empty");
  }

  return JSON.parse(text);
}

function summarizeSelection(provider, method, rankedProviders) {
  return {
    method: method ?? null,
    selected: provider
      ? {
          id: provider.id,
          label: provider.label,
          displayUrl: provider.displayUrl,
        }
      : null,
    rankedProviders: rankedProviders.map((entry) => ({
      id: entry.id,
      label: entry.label,
      displayUrl: entry.displayUrl,
    })),
  };
}

function shouldRetryRpcError(error) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return (
    error.code === -32005 ||
    error.code === 429 ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("eai_again") ||
    message.includes("invalid url") ||
    message.includes("temporarily unavailable") ||
    message.includes("service unavailable")
  );
}

function isBase64AccountData(data) {
  return typeof data === "string" || (Array.isArray(data) && typeof data[0] === "string");
}

function hasMalformedAccountData(payload, responseBody) {
  if (payload.method === "getAccountInfo") {
    const data = responseBody?.result?.value?.data;
    return data != null && !isBase64AccountData(data);
  }

  if (payload.method === "getMultipleAccounts") {
    const accounts = responseBody?.result?.value;
    return Array.isArray(accounts) && accounts.some((account) => {
      if (!account) return false;
      return account.data != null && !isBase64AccountData(account.data);
    });
  }

  return false;
}

function requestLabel(payload) {
  const method = Array.isArray(payload) ? `batch:${payload.length}` : payload?.method;
  const id = Array.isArray(payload) ? "batch" : (payload?.id ?? "null");
  return `method=${method ?? "unknown"} id=${id}`;
}

function logGatewayEvent(config, level, message, details = {}) {
  if (config.logLevel === "silent") return;
  if (level === "debug" && config.logLevel !== "debug") return;
  const serialized = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    `[tsn-rpc-gateway] ${message}${serialized ? ` ${serialized}` : ""}`,
  );
}

async function fetchRpcPayload(provider, payload, timeoutMs) {
  const signal = createTimeoutSignal(timeoutMs);
  const startedAt = performance.now();
  const response = await globalThis.fetch(provider.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });
  const latencyMs = performance.now() - startedAt;
  const text = await response.text();
  let parsed;

  try {
    parsed = parseJsonBody(text);
  } catch (error) {
    throw Object.assign(new Error(`Upstream ${provider.label} returned non-JSON response`), {
      cause: error,
      latencyMs,
      retryable: true,
    });
  }

  if (!response.ok && response.status >= 500) {
    throw Object.assign(new Error(`Upstream ${provider.label} returned ${response.status}`), {
      latencyMs,
      retryable: true,
      responseBody: parsed,
    });
  }

  if (!response.ok && response.status === 429) {
    throw Object.assign(new Error(`Upstream ${provider.label} rate limited the request`), {
      latencyMs,
      retryable: true,
      responseBody: parsed,
    });
  }

  if (isJsonObject(parsed) && parsed.error && shouldRetryRpcError(parsed.error)) {
    throw Object.assign(
      new Error(`Upstream ${provider.label} JSON-RPC error: ${parsed.error.message ?? parsed.error.code}`),
      {
        latencyMs,
        retryable: true,
        responseBody: parsed,
      },
    );
  }

  if (isJsonObject(parsed) && hasMalformedAccountData(payload, parsed)) {
    throw Object.assign(new Error(`Upstream ${provider.label} returned malformed account data`), {
      latencyMs,
      retryable: true,
      responseBody: parsed,
    });
  }

  return { body: parsed, latencyMs };
}

async function proxySinglePayload(pool, config, payload) {
  const rankedProviders = pool.getRankedProviders(payload.method);
  let lastError = null;

  for (const provider of rankedProviders) {
    try {
      logGatewayEvent(config, "debug", "upstream request", {
        ...Object.fromEntries(requestLabel(payload).split(" ").map((entry) => entry.split("="))),
        provider: provider.label,
      });
      const result = await fetchRpcPayload(provider, payload, config.timeoutMs);
      logGatewayEvent(config, "info", "upstream success", {
        ...Object.fromEntries(requestLabel(payload).split(" ").map((entry) => entry.split("="))),
        provider: provider.label,
        latencyMs: Math.round(result.latencyMs),
      });
      pool.recordOutcome(provider.url, {
        type: "success",
        latencyMs: result.latencyMs,
      });
      return {
        body: result.body,
        provider,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logGatewayEvent(config, error?.retryable ? "warn" : "error", "upstream failure", {
        ...Object.fromEntries(requestLabel(payload).split(" ").map((entry) => entry.split("="))),
        provider: provider.label,
        retryable: Boolean(error?.retryable),
        error: message.replace(/\s+/g, " "),
      });
      pool.recordOutcome(provider.url, {
        type: "failure",
        latencyMs: Number(error?.latencyMs ?? config.timeoutMs),
        errorMessage: message,
      });
      lastError = error;
      if (!error?.retryable) {
        break;
      }
    }
  }

  throw lastError ?? new Error("No upstream Solana RPC providers are available");
}

async function proxyBatchPayload(pool, config, payload) {
  const results = [];
  for (const entry of payload) {
    if (!isJsonObject(entry)) {
      results.push({
        jsonrpc: "2.0",
        id: entry?.id ?? null,
        error: {
          code: -32600,
          message: "Invalid JSON-RPC batch entry",
        },
      });
      continue;
    }

    try {
      const { body } = await proxySinglePayload(pool, config, entry);
      results.push(body);
    } catch (error) {
      results.push({
        jsonrpc: "2.0",
        id: entry.id ?? null,
        error: {
          code: -32000,
          message:
            error instanceof Error
              ? error.message
              : "RPC request failed across all upstream providers",
        },
      });
    }
  }

  return results;
}

export function createRpcGatewayApp(config = getRpcGatewayConfig()) {
  const pool = createProviderPool(config.upstreams, config);

  async function handleRequest(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return textResponse("", 204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse({
        ok: true,
        service: "trustlink-rpc-gateway",
        mode: config.mode,
        timeoutMs: config.timeoutMs,
        logLevel: config.logLevel,
        upstreamCount: config.upstreams.length,
        upstreams: pool.snapshot(),
      });
    }

    if (request.method === "GET" && url.pathname === "/providers") {
      return jsonResponse({
        ok: true,
        service: "trustlink-rpc-gateway",
        providers: pool.snapshot(),
      });
    }

    if (request.method === "GET" && url.pathname === "/selection") {
      const method = url.searchParams.get("method") ?? undefined;
      const rankedProviders = pool.getRankedProviders(method);
      return jsonResponse({
        ok: true,
        service: "trustlink-rpc-gateway",
        upstreams: summarizeSelection(rankedProviders[0], method, rankedProviders),
      });
    }

    if (request.method !== "POST" || (url.pathname !== "/" && url.pathname !== "/rpc")) {
      return textResponse("TrustLink RPC gateway", 200);
    }

    let payload;
    try {
      payload = parseJsonBody(await request.text());
    } catch (error) {
      return jsonResponse(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: error instanceof Error ? error.message : "Invalid JSON-RPC payload",
          },
        },
        400,
      );
    }

    if (Array.isArray(payload)) {
      const body = await proxyBatchPayload(pool, config, payload);
      return jsonResponse(body, 200, {
        "x-tsn-rpc-gateway": "trustlink",
      });
    }

    if (!isJsonObject(payload) || typeof payload.method !== "string") {
      return jsonResponse(
        {
          jsonrpc: "2.0",
          id: payload?.id ?? null,
          error: {
            code: -32600,
            message: "Invalid JSON-RPC request",
          },
        },
        400,
      );
    }

    try {
      const { body, provider } = await proxySinglePayload(pool, config, payload);
      return jsonResponse(body, 200, {
        "x-tsn-rpc-gateway": "trustlink",
        "x-tsn-rpc-provider": provider.displayUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "RPC request failed across all upstream providers";
      return jsonResponse(
        {
          jsonrpc: "2.0",
          id: payload.id ?? null,
          error: {
            code: -32000,
            message,
            data: {
              upstreams: config.upstreams.map((entry) => redactRpcUrlForDisplay(entry.url)),
            },
          },
        },
        200,
        {
          "x-tsn-rpc-gateway": "trustlink",
        },
      );
    }
  }

  return {
    fetch: handleRequest,
    config,
    pool,
  };
}

let defaultRpcGatewayApp = null;

export function fetch(request, env, ctx) {
  defaultRpcGatewayApp ??= createRpcGatewayApp();
  return defaultRpcGatewayApp.fetch(request, env, ctx);
}
