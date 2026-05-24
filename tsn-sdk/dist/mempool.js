import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { TsnHttpClient } from "./client.js";
function now() {
    return new Date().toISOString();
}
async function readSnapshot(path) {
    try {
        return JSON.parse(await readFile(path, "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return { intents: [], claimRequests: [], proofs: [] };
        }
        throw error;
    }
}
async function writeSnapshot(path, snapshot) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
export class JsonFileTsnMempool {
    path;
    constructor(path = process.env.TSN_MEMPOOL_FILE ?? ".tsn/mempool.json") {
        this.path = resolve(process.cwd(), path);
    }
    async postIntent(request) {
        const snapshot = await readSnapshot(this.path);
        const existing = snapshot.intents.find((intent) => intent.paymentId === request.paymentId);
        if (existing)
            return existing;
        const timestamp = now();
        const intent = {
            ...request,
            id: request.paymentId,
            status: "pending",
            postedAt: timestamp,
            updatedAt: timestamp,
        };
        snapshot.intents.push(intent);
        await writeSnapshot(this.path, snapshot);
        return intent;
    }
    async postClaimRequest(request) {
        const snapshot = await readSnapshot(this.path);
        const existing = snapshot.claimRequests.find((claimRequest) => claimRequest.intentId === request.intentId && claimRequest.status !== "failed" && claimRequest.status !== "canceled");
        if (existing)
            return existing;
        const timestamp = now();
        const claimRequest = {
            ...request,
            id: randomUUID(),
            status: "pending",
            postedAt: timestamp,
            updatedAt: timestamp,
        };
        snapshot.claimRequests.push(claimRequest);
        await writeSnapshot(this.path, snapshot);
        return claimRequest;
    }
    async listPendingWork(limit = 50) {
        const snapshot = await readSnapshot(this.path);
        const pendingClaims = snapshot.claimRequests
            .filter((claimRequest) => claimRequest.status === "pending")
            .sort((left, right) => left.postedAt.localeCompare(right.postedAt))
            .slice(0, limit);
        return pendingClaims.flatMap((claimRequest) => {
            const intent = snapshot.intents.find((candidate) => candidate.id === claimRequest.intentId && candidate.status === "pending");
            return intent ? [{ intent, claimRequest }] : [];
        });
    }
    async updateIntentStatus(id, status, patch = {}) {
        const snapshot = await readSnapshot(this.path);
        const intent = snapshot.intents.find((candidate) => candidate.id === id);
        if (!intent)
            return null;
        Object.assign(intent, patch, { status, updatedAt: now() });
        await writeSnapshot(this.path, snapshot);
        return intent;
    }
    async updateClaimRequestStatus(id, status, patch = {}) {
        const snapshot = await readSnapshot(this.path);
        const claimRequest = snapshot.claimRequests.find((candidate) => candidate.id === id);
        if (!claimRequest)
            return null;
        Object.assign(claimRequest, patch, { status, updatedAt: now() });
        await writeSnapshot(this.path, snapshot);
        return claimRequest;
    }
    async postProof(request) {
        const snapshot = await readSnapshot(this.path);
        if (!snapshot.proofs)
            snapshot.proofs = [];
        snapshot.proofs.push(request);
        await writeSnapshot(this.path, snapshot);
        return request;
    }
}
export class HttpTsnMempool {
    client;
    constructor(baseUrl = process.env.TSN_MEMPOOL_URL) {
        if (!baseUrl) {
            throw new Error("TSN_MEMPOOL_URL is required for HttpTsnMempool");
        }
        this.client = new TsnHttpClient({ baseUrl });
    }
    postIntent(request) {
        return this.client.postIntent(request);
    }
    postClaimRequest(request) {
        return this.client.postClaimRequest(request);
    }
    listPendingWork(limit = 50) {
        return this.client.listPendingWork(limit);
    }
    updateIntentStatus(id, status, patch = {}) {
        return this.client.updateIntentStatus(id, {
            ...patch,
            status,
        });
    }
    updateClaimRequestStatus(id, status, patch = {}) {
        return this.client.updateClaimRequestStatus(id, {
            ...patch,
            status,
        });
    }
    postProof(request) {
        return this.client.postProof(request);
    }
}
