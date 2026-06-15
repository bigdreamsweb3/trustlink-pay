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
            return { intents: [], claimRequests: [], proofs: [], recoveries: [] };
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
    async listIntents(params = {}) {
        const snapshot = await readSnapshot(this.path);
        const items = params.status
            ? snapshot.intents.filter((intent) => intent.status === params.status)
            : snapshot.intents;
        return [...items].sort((left, right) => left.postedAt.localeCompare(right.postedAt));
    }
    async listClaimRequests(params = {}) {
        const snapshot = await readSnapshot(this.path);
        const items = snapshot.claimRequests.filter((claimRequest) => {
            if (params.intentId && claimRequest.intentId !== params.intentId)
                return false;
            if (params.status && claimRequest.status !== params.status)
                return false;
            return true;
        });
        return [...items].sort((left, right) => left.postedAt.localeCompare(right.postedAt));
    }
    async listPendingWork(limit = 50) {
        const snapshot = await readSnapshot(this.path);
        const pendingClaims = snapshot.claimRequests
            .filter((claimRequest) => claimRequest.status === "pending")
            .sort((left, right) => left.postedAt.localeCompare(right.postedAt))
            .slice(0, limit);
        return pendingClaims.flatMap((claimRequest) => {
            const intent = snapshot.intents.find((candidate) => candidate.id === claimRequest.intentId && ["escrowed", "onchain", "claimed"].includes(candidate.status));
            return intent ? [{ intent, claimRequest }] : [];
        });
    }
    async listPendingIntentWork(limit = 50) {
        const snapshot = await readSnapshot(this.path);
        return snapshot.intents
            .filter((intent) => intent.status === "pending")
            .sort((left, right) => left.postedAt.localeCompare(right.postedAt))
            .slice(0, limit)
            .map((intent) => ({ intent }));
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
        if (!snapshot.recoveries)
            snapshot.recoveries = [];
        snapshot.proofs.push(request);
        const intent = snapshot.intents.find((candidate) => candidate.id === request.intent_id);
        if (intent && ["escrowed", "onchain", "claimed"].includes(intent.status)) {
            Object.assign(intent, {
                status: "executed",
                proofTxSig: request.proof_tx,
                updatedAt: now(),
            });
            if (intent.transferId &&
                intent.settlementPaymentIntentId &&
                intent.settlementVault &&
                intent.settlementTokenAccount &&
                !snapshot.recoveries.some((item) => item.id === intent.id)) {
                const timestamp = now();
                snapshot.recoveries.push({
                    id: intent.id,
                    paymentId: intent.paymentId,
                    transferId: intent.transferId,
                    paymentIntentId: intent.settlementPaymentIntentId,
                    settlementVault: intent.settlementVault,
                    settlementTokenAccount: intent.settlementTokenAccount,
                    tokenMintAddress: intent.tokenMintAddress,
                    settlementCrankerPubkey: request.cranker_pubkey,
                    privacyVersion: Number(intent.privacyVersion ?? 1),
                    amount: Number(intent.amount),
                    epoch: Number(intent.settlementEpoch ?? 0),
                    rewardLamports: 10_000,
                    priorityScore: Number(intent.amount) * 10,
                    status: "pending",
                    assignedCrankerPubkey: null,
                    leaseExpiresAt: null,
                    recoveryTxSig: null,
                    settlementReason: "Settlement paid; escrow liquidity is ready for recovery.",
                    postedAt: timestamp,
                    updatedAt: timestamp,
                });
            }
        }
        await writeSnapshot(this.path, snapshot);
        return request;
    }
    async listPendingRecoveryWork(operatorPubkey, limit = 20) {
        const snapshot = await readSnapshot(this.path);
        const now = Date.now();
        return (snapshot.recoveries ?? [])
            .filter((item) => {
            if (item.status === "pending")
                return true;
            if (item.status !== "leased")
                return false;
            if (item.assignedCrankerPubkey === operatorPubkey)
                return true;
            return item.leaseExpiresAt ? Date.parse(item.leaseExpiresAt) <= now : false;
        })
            .sort((left, right) => right.priorityScore - left.priorityScore)
            .slice(0, limit);
    }
    async claimRecoveryLease(id, operatorPubkey) {
        const snapshot = await readSnapshot(this.path);
        const item = (snapshot.recoveries ?? []).find((candidate) => candidate.id === id);
        if (!item)
            throw new Error(`Recovery ${id} not found`);
        const now = Date.now();
        const heldByAnother = item.status === "leased" &&
            item.assignedCrankerPubkey !== operatorPubkey &&
            (!item.leaseExpiresAt || Date.parse(item.leaseExpiresAt) > now);
        if (heldByAnother)
            throw new Error(`Recovery ${id} is leased by another Cranker`);
        Object.assign(item, {
            status: "leased",
            assignedCrankerPubkey: operatorPubkey,
            leaseExpiresAt: new Date(now + 5 * 60_000).toISOString(),
            updatedAt: new Date(now).toISOString(),
        });
        await writeSnapshot(this.path, snapshot);
        return item;
    }
    async updateRecoveryStatus(id, operatorPubkey, status, patch = {}) {
        const snapshot = await readSnapshot(this.path);
        const item = (snapshot.recoveries ?? []).find((candidate) => candidate.id === id);
        if (!item)
            return null;
        if (item.assignedCrankerPubkey && item.assignedCrankerPubkey !== operatorPubkey) {
            throw new Error(`Recovery ${id} is leased by another Cranker`);
        }
        Object.assign(item, patch, {
            status,
            updatedAt: now(),
            ...(status === "pending"
                ? { assignedCrankerPubkey: null, leaseExpiresAt: null }
                : {}),
        });
        await writeSnapshot(this.path, snapshot);
        return item;
    }
}
export class HttpTsnMempool {
    client;
    constructor(baseUrl = process.env.TSN_MEMPOOL_URL, apiKey = process.env.TSN_MEMPOOL_API_KEY) {
        if (!baseUrl) {
            throw new Error("TSN_MEMPOOL_URL is required for HttpTsnMempool");
        }
        this.client = new TsnHttpClient({ baseUrl, apiKey });
    }
    postIntent(request) {
        return this.client.postIntent(request);
    }
    postClaimRequest(request) {
        return this.client.postClaimRequest(request);
    }
    listIntents(params = {}) {
        const search = new URLSearchParams();
        if (params.status)
            search.set("status", params.status);
        const query = search.toString();
        return this.client.get(`/intents${query ? `?${query}` : ""}`);
    }
    listClaimRequests(params = {}) {
        const search = new URLSearchParams();
        if (params.intentId)
            search.set("intent_id", params.intentId);
        if (params.status)
            search.set("status", params.status);
        const query = search.toString();
        return this.client.get(`/claim-requests${query ? `?${query}` : ""}`);
    }
    listPendingWork(limit = 50) {
        return this.client.listPendingWork(limit);
    }
    listPendingIntentWork(limit = 50) {
        return this.client.listPendingIntentWork(limit);
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
    listPendingRecoveryWork(operatorPubkey, limit = 20) {
        return this.client.listRecoveryWork(operatorPubkey, limit);
    }
    claimRecoveryLease(id, operatorPubkey) {
        return this.client.claimRecoveryLease(id, { operatorPubkey });
    }
    updateRecoveryStatus(id, operatorPubkey, status, patch = {}) {
        return this.client.updateRecoveryStatus(id, {
            ...patch,
            operatorPubkey,
            status,
        });
    }
}
