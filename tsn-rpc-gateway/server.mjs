import http from "node:http";

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

const server = http.createServer(async (request, response) => {
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

server.listen(config.port, "0.0.0.0", () => {
  console.log("TrustLink RPC gateway");
  console.log(`Port: ${config.port}`);
  console.log(`Mode: ${config.mode}`);
  console.log(`Timeout: ${config.timeoutMs}ms`);
  console.log("Upstreams:");
  for (const upstream of config.upstreams) {
    console.log(`- ${upstream.id} (${upstream.label}) -> ${redactRpcUrlForDisplay(upstream.url)}`);
  }
});

function shutdown(signal) {
  console.log(`Received ${signal}, closing TrustLink RPC gateway...`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
