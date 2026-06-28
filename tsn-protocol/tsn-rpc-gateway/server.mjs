import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

import { createRpcGatewayApp } from "./gateway.mjs";
import { getRpcGatewayConfig, redactRpcUrlForDisplay } from "./config.mjs";

function toHeaderRecord(headers) {
  const record = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      record[key] = value.join(", ");
    } else if (value != null) {
      record[key] = String(value);
    }
  }
  return record;
}

async function requestToFetchRequest(request, baseUrl) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks);
  const init = {
    method: request.method ?? "GET",
    headers: toHeaderRecord(request.headers),
  };

  if (body.length > 0 && init.method !== "GET" && init.method !== "HEAD") {
    init.body = body;
    init.duplex = "half";
  }

  return new Request(baseUrl, init);
}

async function responseToNode(response, nodeResponse) {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });

  const arrayBuffer = await response.arrayBuffer();
  nodeResponse.end(Buffer.from(arrayBuffer));
}

const config = getRpcGatewayConfig();
const app = createRpcGatewayApp(config);

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin, solana-client",
    "access-control-max-age": "86400",
  };
}

const server = http.createServer(async (request, response) => {
  const cors = corsHeaders();
  for (const [key, value] of Object.entries(cors)) {
    response.setHeader(key, value);
  }

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  try {
    const host = request.headers.host ?? `127.0.0.1:${config.port}`;
    const baseUrl = `http://${host}${request.url ?? "/"}`;
    const fetchRequest = await requestToFetchRequest(request, baseUrl);
    const fetchResponse = await app.fetch(fetchRequest);
    await responseToNode(fetchResponse, response);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(
      JSON.stringify(
        {
          ok: false,
          service: "trustlink-rpc-gateway",
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
  }
});

function closeSocketPair(clientSocket, upstreamSocket) {
  if (clientSocket.readyState === WebSocket.OPEN || clientSocket.readyState === WebSocket.CONNECTING) {
    clientSocket.close();
  }
  if (
    upstreamSocket.readyState === WebSocket.OPEN ||
    upstreamSocket.readyState === WebSocket.CONNECTING
  ) {
    upstreamSocket.close();
  }
}

async function connectUpstreamWebSocket() {
  const providers = app.pool.getRankedProviders();
  let lastError = null;

  for (const provider of providers) {
    try {
      const socket = await new Promise((resolve, reject) => {
        const ws = new WebSocket(provider.wsUrl);
        const cleanup = () => {
          ws.removeAllListeners("open");
          ws.removeAllListeners("error");
        };
        ws.once("open", () => {
          cleanup();
          resolve({ socket: ws, provider });
        });
        ws.once("error", (error) => {
          cleanup();
          reject(Object.assign(error instanceof Error ? error : new Error(String(error)), { provider }));
        });
      });
      return socket;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("No upstream Solana WebSocket providers are available");
}

const wsHttpServer = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(
      JSON.stringify(
        {
          ok: true,
          service: "trustlink-rpc-gateway-ws",
          wsPort: config.wsPort,
          upstreamCount: config.upstreams.length,
          upstreams: config.upstreams.map((upstream) => ({
            id: upstream.id,
            label: upstream.label,
            wsUrl: upstream.displayWsUrl,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  response.statusCode = 426;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end("Upgrade Required");
});

const wsServer = new WebSocketServer({ noServer: true });

wsHttpServer.on("upgrade", async (request, socket, head) => {
  try {
    const upstream = await connectUpstreamWebSocket();
    wsServer.handleUpgrade(request, socket, head, (clientSocket) => {
      clientSocket.on("message", (data, isBinary) => {
        if (upstream.socket.readyState === WebSocket.OPEN) {
          upstream.socket.send(data, { binary: isBinary });
        }
      });

      upstream.socket.on("message", (data, isBinary) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(data, { binary: isBinary });
        }
      });

      clientSocket.on("close", () => closeSocketPair(clientSocket, upstream.socket));
      upstream.socket.on("close", () => closeSocketPair(clientSocket, upstream.socket));
      clientSocket.on("error", () => closeSocketPair(clientSocket, upstream.socket));
      upstream.socket.on("error", () => closeSocketPair(clientSocket, upstream.socket));
    });
  } catch (error) {
    socket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    socket.destroy();
  }
});

server.listen(config.port, "0.0.0.0", () => {
  console.log("TrustLink RPC gateway");
  console.log(`HTTP RPC port: ${config.port}`);
  console.log(`WebSocket port: ${config.wsPort}`);
  console.log(`Mode: ${config.mode}`);
  console.log(`Timeout: ${config.timeoutMs}ms`);
  console.log(`Log level: ${config.logLevel}`);
  console.log("Upstreams:");
  for (const upstream of config.upstreams) {
    console.log(
      `- ${upstream.id} (${upstream.label}) -> ${redactRpcUrlForDisplay(upstream.url)} | ws ${upstream.displayWsUrl}`,
    );
  }
});

wsHttpServer.listen(config.wsPort, "0.0.0.0");

function shutdown(signal) {
  console.log(`Received ${signal}, closing TrustLink RPC gateway...`);
  let remaining = 2;
  const finish = () => {
    remaining -= 1;
    if (remaining === 0) process.exit(0);
  };
  server.close(finish);
  wsHttpServer.close(finish);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
