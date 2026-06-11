import { createServer } from "node:http";
import { JsonFileTsnMempool } from "./mempool.js";
const mempool = new JsonFileTsnMempool();
const port = Number(process.env.TSN_MEMPOOL_PORT ?? 8787);
async function readJson(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks).toString("utf8");
    return body ? JSON.parse(body) : {};
}
function send(response, status, body) {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
}
function routeUrl(request) {
    return new URL(request.url ?? "/", `http://localhost:${port}`);
}
createServer(async (request, response) => {
    try {
        const url = routeUrl(request);
        const path = url.pathname;
        if (request.method === "POST" && path === "/intents") {
            return send(response, 200, await mempool.postIntent(await readJson(request)));
        }
        if (request.method === "GET" && path === "/intents") {
            return send(response, 200, await mempool.listIntents({ status: url.searchParams.get("status") }));
        }
        if (request.method === "POST" && path === "/claim-requests") {
            return send(response, 200, await mempool.postClaimRequest(await readJson(request)));
        }
        if (request.method === "GET" && path === "/claim-requests") {
            return send(response, 200, await mempool.listClaimRequests({
                intentId: url.searchParams.get("intent_id") ?? undefined,
                status: url.searchParams.get("status"),
            }));
        }
        if (request.method === "GET" && path === "/work") {
            return send(response, 200, await mempool.listPendingWork(Number(url.searchParams.get("limit") ?? 50)));
        }
        if (request.method === "GET" && path === "/intent-work") {
            return send(response, 200, await mempool.listPendingIntentWork(Number(url.searchParams.get("limit") ?? 50)));
        }
        if (request.method === "GET" && path === "/commitment-registry") {
            return send(response, 200, await mempool.listCommitmentRegistry());
        }
        if (request.method === "GET" && path === "/claim-points") {
            return send(response, 200, await mempool.listClaimPointLedger());
        }
        if (request.method === "GET" && path === "/claim-leases") {
            return send(response, 200, await mempool.listClaimLeases());
        }
        if (request.method === "GET" && path === "/recovery-queue") {
            return send(response, 200, await mempool.listRecoveryQueue({ status: url.searchParams.get("status") }));
        }
        if (request.method === "GET" && path === "/liquidity-metrics") {
            return send(response, 200, await mempool.getLiquidityMetrics());
        }
        if (request.method === "POST" && path === "/proofs") {
            return send(response, 200, await mempool.postProof(await readJson(request)));
        }
        const verifyMatch = path.match(/^\/intents\/([^/]+)\/verify$/);
        if (request.method === "POST" && verifyMatch) {
            const body = await readJson(request);
            return send(response, 200, await mempool.submitIntentVerification(decodeURIComponent(verifyMatch[1]), body.crankerPubkey, body));
        }
        const leaseMatch = path.match(/^\/intents\/([^/]+)\/claim-lease$/);
        if (request.method === "POST" && leaseMatch) {
            const body = await readJson(request);
            return send(response, 200, await mempool.acquireClaimLease(decodeURIComponent(leaseMatch[1]), body.crankerPubkey));
        }
        const intentStatusMatch = path.match(/^\/intents\/([^/]+)\/status$/);
        if (request.method === "PATCH" && intentStatusMatch) {
            const body = await readJson(request);
            return send(response, 200, await mempool.updateIntentStatus(decodeURIComponent(intentStatusMatch[1]), body.status, body));
        }
        const claimStatusMatch = path.match(/^\/claim-requests\/([^/]+)\/status$/);
        if (request.method === "PATCH" && claimStatusMatch) {
            const body = await readJson(request);
            return send(response, 200, await mempool.updateClaimRequestStatus(decodeURIComponent(claimStatusMatch[1]), body.status, body));
        }
        const recoveryCompleteMatch = path.match(/^\/recovery-queue\/([^/]+)\/complete$/);
        if (request.method === "POST" && recoveryCompleteMatch) {
            const body = await readJson(request);
            return send(response, 200, await mempool.completeRecoveryJob(decodeURIComponent(recoveryCompleteMatch[1]), body.crankerPubkey, body.proofTx));
        }
        return send(response, 404, { error: "Not found" });
    }
    catch (error) {
        return send(response, 500, { error: error instanceof Error ? error.message : "Unknown error" });
    }
}).listen(port, () => {
    console.log(`[tsn-mempool] listening on http://localhost:${port}`);
});
