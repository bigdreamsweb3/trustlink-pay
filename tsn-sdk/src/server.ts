import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { JsonFileTsnMempool } from "./mempool.js";

const mempool = new JsonFileTsnMempool();
const port = Number(process.env.TSN_MEMPOOL_PORT ?? 8787);

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/intents") {
      return send(response, 200, await mempool.postIntent(await readJson(request)));
    }
    if (request.method === "POST" && request.url === "/claim-requests") {
      return send(response, 200, await mempool.postClaimRequest(await readJson(request)));
    }
    if (request.method === "GET" && request.url?.startsWith("/work")) {
      const url = new URL(request.url, `http://localhost:${port}`);
      return send(response, 200, { intents: await mempool.listPendingWork(Number(url.searchParams.get("limit") ?? 50)) });
    }
    if (request.method === "POST" && request.url === "/epoch-challenges") {
      return send(response, 200, await mempool.publishEpochChallenge(await readJson(request)));
    }
    if (request.method === "GET" && request.url?.startsWith("/epoch-challenges")) {
      const url = new URL(request.url, `http://localhost:${port}`);
      return send(response, 200, await mempool.listOpenEpochChallenges(Number(url.searchParams.get("limit") ?? 20)));
    }
    const challengeStatusMatch = request.url?.match(/^\/epoch-challenges\/([^/]+)\/status$/);
    if (request.method === "PATCH" && challengeStatusMatch) {
      const body = await readJson(request);
      return send(
        response,
        200,
        await mempool.updateEpochChallengeStatus(decodeURIComponent(challengeStatusMatch[1]), body.status, body),
      );
    }
    return send(response, 404, { error: "Not found" });
  } catch (error) {
    return send(response, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
}).listen(port, () => {
  console.log(`[tsn-mempool] listening on http://localhost:${port}`);
});