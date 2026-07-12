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

function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
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

function formatAgo(timestamp) {
  if (!timestamp) return "never";
  const deltaMs = Math.max(0, Date.now() - timestamp);
  if (deltaMs < 1_000) return "now";
  if (deltaMs < 60_000) return `${Math.round(deltaMs / 1_000)}s ago`;
  if (deltaMs < 3_600_000) return `${Math.round(deltaMs / 60_000)}m ago`;
  return `${Math.round(deltaMs / 3_600_000)}h ago`;
}

function renderDashboard(config, status) {
  const leader = status.leader;
  const rows = status.providers
    .map((provider) => {
      const health = provider.stats.healthy ? "healthy" : "degraded";
      return `
        <tr>
          <td>${provider.label}${provider.isLeader ? " <strong>(leader)</strong>" : ""}</td>
          <td>${health}</td>
          <td>${provider.stats.lastProbeLatencyMs ?? "-"}</td>
          <td>${provider.stats.averageLatencyMs ?? "-"}</td>
          <td>${provider.stats.successes}</td>
          <td>${provider.stats.failures}</td>
          <td>${formatAgo(provider.stats.lastProbeAt)}</td>
          <td>${provider.stats.lastError ?? "-"}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta http-equiv="refresh" content="${Math.max(1, Math.round(config.dashboardRefreshMs / 1000))}" />
      <title>TSN RPC Gateway</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #07111a;
          --panel: #0d1c28;
          --muted: #8ea3b5;
          --text: #edf5fb;
          --good: #3fd08c;
          --warn: #ffb85c;
          --bad: #ff7d7d;
          --border: #173244;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          background: linear-gradient(180deg, #08131d 0%, #07111a 100%);
          color: var(--text);
          padding: 24px;
        }
        .wrap { max-width: 1200px; margin: 0 auto; }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }
        .panel {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 14px;
        }
        .label {
          font-size: 12px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 8px;
        }
        .value {
          font-size: 18px;
          font-weight: 600;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }
        th, td {
          text-align: left;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          vertical-align: top;
          font-size: 13px;
        }
        th { color: var(--muted); font-weight: 600; }
        tr:last-child td { border-bottom: none; }
        .good { color: var(--good); }
        .warn { color: var(--warn); }
        .bad { color: var(--bad); }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="grid">
          <div class="panel">
            <div class="label">Current Leader</div>
            <div class="value">${leader ? leader.label : "none"}</div>
          </div>
          <div class="panel">
            <div class="label">Leader Latency</div>
            <div class="value">${leader?.latencyMs ?? "-"} ms</div>
          </div>
          <div class="panel">
            <div class="label">Last Probe Round</div>
            <div class="value">${status.probeState.lastDurationMs ?? "-"} ms</div>
          </div>
          <div class="panel">
            <div class="label">Probe Interval</div>
            <div class="value">${Math.round(status.probeIntervalMs / 1000)} s</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Health</th>
              <th>Probe</th>
              <th>Average</th>
              <th>Success</th>
              <th>Failure</th>
              <th>Last Probe</th>
              <th>Last Error</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </body>
  </html>`;
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
  const pool = createProviderPool(config.upstreams, {
    mode: config.mode,
    probeIntervalMs: config.probeIntervalMs,
    probeTimeoutMs: config.probeTimeoutMs,
    onLeaderChange(event) {
      logGatewayEvent(config, "info", "leader changed", {
        from: event.previous?.label ?? "none",
        to: event.current?.label ?? "none",
        reason: event.selectionReason,
      });
    },
    onProbeRound(summary) {
      const leader = summary.leader?.label ?? "none";
      logGatewayEvent(config, "debug", "probe round", {
        round: summary.round,
        reason: summary.reason,
        leader,
        durationMs: summary.durationMs,
      });
    },
  });
  pool.startProbing();

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
      const status = pool.getStatus();
      return jsonResponse({
        ok: true,
        service: "trustlink-rpc-gateway",
        mode: config.mode,
        timeoutMs: config.timeoutMs,
        probeIntervalMs: config.probeIntervalMs,
        probeTimeoutMs: config.probeTimeoutMs,
        logLevel: config.logLevel,
        upstreamCount: config.upstreams.length,
        leader: status.leader,
        probeState: status.probeState,
        upstreams: status.providers,
      });
    }

    if (request.method === "GET" && url.pathname === "/providers") {
      const status = pool.getStatus();
      return jsonResponse({
        ok: true,
        service: "trustlink-rpc-gateway",
        leader: status.leader,
        providers: status.providers,
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

    if (request.method === "GET" && url.pathname === "/status") {
      return jsonResponse({
        ok: true,
        service: "trustlink-rpc-gateway",
        ...pool.getStatus(),
      });
    }

    if (request.method === "GET" && url.pathname === "/dashboard") {
      return htmlResponse(renderDashboard(config, pool.getStatus()));
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
