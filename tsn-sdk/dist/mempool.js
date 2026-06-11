import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { TsnHttpClient } from "./client.js";
import { createEncryptedSettlementToken, createOneTimeDecryptionToken, currentTsnEpoch, settlementSha256Hex, } from "./settlement-token.js";
function now() {
    return new Date().toISOString();
}
function defaultLiquidityMetrics() {
    return {
        activeLiquidity: Number(process.env.TSN_ACTIVE_LIQUIDITY ?? 0),
        pendingIntentAmount: 0,
        vaultBalance: Number(process.env.TSN_VAULT_BALANCE ?? 0),
        settlementVelocity: 0,
        liquidityConsumptionRate: 0,
        lowLiquidityThreshold: Number(process.env.TSN_LOW_LIQUIDITY_THRESHOLD ?? 100),
        updatedAt: now(),
    };
}
function normalizeSnapshot(snapshot) {
    snapshot.proofs ??= [];
    snapshot.commitmentRegistry ??= [];
    snapshot.claimPointLedger ??= [];
    snapshot.claimLeases ??= [];
    snapshot.recoveryQueue ??= [];
    snapshot.liquidityMetrics ??= defaultLiquidityMetrics();
    return snapshot;
}
async function readSnapshot(path) {
    try {
        return normalizeSnapshot(JSON.parse(await readFile(path, "utf8")));
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return normalizeSnapshot({ intents: [], claimRequests: [], proofs: [] });
        }
        throw error;
    }
}
async function writeSnapshot(path, snapshot) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(normalizeSnapshot(snapshot), null, 2)}\n`, "utf8");
}
function ensureSettlementToken(request) {
    if (request.encryptedSettlementToken && request.settlementTokenCommitmentHash)
        return request;
    const epoch = request.epoch ?? currentTsnEpoch();
    const bundle = createEncryptedSettlementToken({
        transferId: request.paymentId,
        recipientHash: request.recipientHash,
        tokenMintAddress: request.tokenMintAddress,
        amount: request.amount,
        epoch,
    });
    return {
        ...request,
        epoch,
        encryptedSettlementToken: bundle.encryptedSettlementToken,
        settlementTokenCommitmentHash: bundle.commitmentHash,
    };
}
function registryEntryForIntent(intent) {
    if (!intent.encryptedSettlementToken || !intent.settlementTokenCommitmentHash) {
        throw new Error("TSN intent is missing encrypted settlement token commitment");
    }
    return {
        transferId: intent.id,
        encryptedSettlementToken: intent.encryptedSettlementToken,
        commitmentHash: intent.settlementTokenCommitmentHash,
        timestamp: intent.postedAt,
        epoch: intent.epoch ?? currentTsnEpoch(),
        recoverable: false,
        updatedAt: now(),
    };
}
function getLedger(snapshot, crankerPubkey) {
    snapshot.claimPointLedger ??= [];
    let entry = snapshot.claimPointLedger.find((candidate) => candidate.crankerPubkey === crankerPubkey);
    if (!entry) {
        entry = { crankerPubkey, earned: 0, available: 0, leased: 0, lastIntentWorkAt: null };
        snapshot.claimPointLedger.push(entry);
    }
    return entry;
}
function refreshLiquidityMetrics(snapshot) {
    snapshot.liquidityMetrics ??= defaultLiquidityMetrics();
    const pendingIntentAmount = snapshot.intents
        .filter((intent) => ["pending", "escrowed", "onchain", "claimed"].includes(intent.status))
        .reduce((total, intent) => total + Number(intent.amount || 0), 0);
    const executedCount = snapshot.intents.filter((intent) => intent.status === "executed" || intent.status === "settled").length;
    const activeLiquidity = Math.max(0, Number(snapshot.liquidityMetrics.activeLiquidity || 0));
    const vaultBalance = Math.max(0, Number(snapshot.liquidityMetrics.vaultBalance || activeLiquidity));
    snapshot.liquidityMetrics = {
        ...snapshot.liquidityMetrics,
        activeLiquidity,
        vaultBalance,
        pendingIntentAmount,
        settlementVelocity: executedCount,
        liquidityConsumptionRate: activeLiquidity > 0 ? pendingIntentAmount / activeLiquidity : pendingIntentAmount,
        updatedAt: now(),
    };
    return snapshot.liquidityMetrics;
}
function recoveryPriority(metrics, jobAmount) {
    const deficit = Math.max(0, metrics.lowLiquidityThreshold - metrics.activeLiquidity);
    return Number((deficit * 10 + metrics.pendingIntentAmount * 2 + metrics.settlementVelocity + jobAmount).toFixed(6));
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
        const securedRequest = ensureSettlementToken(request);
        const intent = {
            ...securedRequest,
            id: securedRequest.paymentId,
            status: "pending",
            postedAt: timestamp,
            updatedAt: timestamp,
        };
        snapshot.intents.push(intent);
        snapshot.commitmentRegistry.push(registryEntryForIntent(intent));
        refreshLiquidityMetrics(snapshot);
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
        refreshLiquidityMetrics(snapshot);
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
    async listCommitmentRegistry() {
        return (await readSnapshot(this.path)).commitmentRegistry;
    }
    async listClaimPointLedger() {
        return (await readSnapshot(this.path)).claimPointLedger;
    }
    async listClaimLeases() {
        return (await readSnapshot(this.path)).claimLeases;
    }
    async listRecoveryQueue(params = {}) {
        const queue = (await readSnapshot(this.path)).recoveryQueue;
        return params.status ? queue.filter((entry) => entry.status === params.status) : queue;
    }
    async getLiquidityMetrics() {
        const snapshot = await readSnapshot(this.path);
        const metrics = refreshLiquidityMetrics(snapshot);
        await writeSnapshot(this.path, snapshot);
        return metrics;
    }
    async submitIntentVerification(id, crankerPubkey, patch = {}) {
        const snapshot = await readSnapshot(this.path);
        const intent = snapshot.intents.find((candidate) => candidate.id === id);
        if (!intent)
            return null;
        if (!intent.encryptedSettlementToken || !intent.settlementTokenCommitmentHash) {
            throw new Error("Intent verification failed: encrypted settlement token commitment is missing");
        }
        const registryEntry = snapshot.commitmentRegistry.find((entry) => entry.transferId === id);
        if (!registryEntry)
            snapshot.commitmentRegistry.push(registryEntryForIntent(intent));
        Object.assign(intent, patch, {
            status: "escrowed",
            assignedCrankerPubkey: crankerPubkey,
            updatedAt: now(),
        });
        const ledger = getLedger(snapshot, crankerPubkey);
        ledger.earned += 1;
        ledger.available += 1;
        ledger.lastIntentWorkAt = now();
        refreshLiquidityMetrics(snapshot);
        await writeSnapshot(this.path, snapshot);
        return intent;
    }
    async acquireClaimLease(intentId, crankerPubkey) {
        const snapshot = await readSnapshot(this.path);
        const registryEntry = snapshot.commitmentRegistry.find((entry) => entry.transferId === intentId);
        if (!registryEntry)
            throw new Error("Commitment registry entry not found");
        if (registryEntry.recoverable)
            throw new Error("Transfer is already recoverable; no claim lease is permitted");
        if (registryEntry.otdtHash)
            throw new Error("OTDT has already been issued for this transfer");
        const existingLease = snapshot.claimLeases.find((lease) => lease.transferId === intentId && lease.status === "active" && Date.parse(lease.expiresAt) > Date.now());
        if (existingLease)
            return existingLease;
        const ledger = getLedger(snapshot, crankerPubkey);
        if (ledger.available < 1)
            throw new Error("Cranker has no available claim points for a claim lease");
        ledger.available -= 1;
        ledger.leased += 1;
        const issuedAt = now();
        const lease = {
            id: randomUUID(),
            transferId: intentId,
            crankerPubkey,
            status: "active",
            pointsSpent: 1,
            issuedAt,
            expiresAt: new Date(Date.parse(issuedAt) + Number(process.env.TSN_CLAIM_LEASE_TTL_MS ?? 10 * 60_000)).toISOString(),
        };
        const otdt = createOneTimeDecryptionToken({
            transferId: intentId,
            leaseId: lease.id,
            crankerPubkey,
            commitmentHash: registryEntry.commitmentHash,
        });
        lease.otdtHash = otdt.tokenHash;
        registryEntry.otdtHash = otdt.tokenHash;
        registryEntry.updatedAt = now();
        snapshot.claimLeases.push(lease);
        const intent = snapshot.intents.find((candidate) => candidate.id === intentId);
        if (intent)
            Object.assign(intent, { status: "claimed", claimLeaseId: lease.id, updatedAt: now() });
        await writeSnapshot(this.path, snapshot);
        return lease;
    }
    async updateIntentStatus(id, status, patch = {}) {
        const snapshot = await readSnapshot(this.path);
        const intent = snapshot.intents.find((candidate) => candidate.id === id);
        if (!intent)
            return null;
        Object.assign(intent, patch, { status, updatedAt: now() });
        refreshLiquidityMetrics(snapshot);
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
        snapshot.proofs.push(request);
        const intent = snapshot.intents.find((candidate) => candidate.id === request.intent_id);
        const registryEntry = snapshot.commitmentRegistry.find((candidate) => candidate.transferId === request.intent_id);
        if (!registryEntry)
            throw new Error("Commitment registry entry not found for proof");
        if (registryEntry.recoverable)
            throw new Error("Transfer is already recoverable");
        if (registryEntry.otdtHash && request.otdt_hash && registryEntry.otdtHash !== request.otdt_hash) {
            throw new Error("OTDT hash mismatch for settlement proof");
        }
        const settlementCommitmentHash = request.settlement_commitment_hash ?? settlementSha256Hex(`${request.intent_id}:${request.proof_tx}:${request.cranker_pubkey}`);
        Object.assign(registryEntry, {
            settlementCommitmentHash,
            settlementProofTx: request.proof_tx,
            recoverable: true,
            updatedAt: now(),
        });
        if (intent && ["escrowed", "onchain", "claimed"].includes(intent.status)) {
            Object.assign(intent, {
                status: "executed",
                proofTxSig: request.proof_tx,
                updatedAt: now(),
            });
        }
        const lease = snapshot.claimLeases.find((candidate) => candidate.transferId === request.intent_id && candidate.status === "active");
        if (lease)
            Object.assign(lease, { status: "completed", completedAt: now() });
        const claim = snapshot.claimRequests.find((candidate) => candidate.intentId === request.intent_id && candidate.status !== "completed");
        if (claim)
            Object.assign(claim, { status: "completed", updatedAt: now() });
        const metrics = refreshLiquidityMetrics(snapshot);
        if (!snapshot.recoveryQueue.some((entry) => entry.transferId === request.intent_id)) {
            const amount = Number(intent?.amount ?? 0);
            const reward = Number((amount * Number(process.env.TSN_RECOVERY_REWARD_BPS ?? 200) / 10_000).toFixed(9));
            const timestamp = now();
            snapshot.recoveryQueue.push({
                id: randomUUID(),
                transferId: request.intent_id,
                epoch: registryEntry.epoch,
                recoverableAmount: amount,
                vaultSource: `commitment:${registryEntry.commitmentHash}`,
                recoveryReward: reward,
                priorityScore: recoveryPriority(metrics, amount),
                status: "open",
                createdAt: timestamp,
                updatedAt: timestamp,
            });
        }
        await writeSnapshot(this.path, snapshot);
        return request;
    }
    async completeRecoveryJob(jobId, crankerPubkey, proofTx) {
        const snapshot = await readSnapshot(this.path);
        const job = snapshot.recoveryQueue.find((candidate) => candidate.id === jobId);
        if (!job || job.status === "completed")
            return job ?? null;
        const timestamp = now();
        Object.assign(job, {
            status: "completed",
            leasedByCrankerPubkey: crankerPubkey,
            proofTx,
            updatedAt: timestamp,
        });
        const registryEntry = snapshot.commitmentRegistry.find((entry) => entry.transferId === job.transferId);
        if (registryEntry)
            Object.assign(registryEntry, { recoveryProofTx: proofTx, updatedAt: timestamp });
        snapshot.liquidityMetrics ??= defaultLiquidityMetrics();
        snapshot.liquidityMetrics.activeLiquidity += job.recoverableAmount;
        snapshot.liquidityMetrics.vaultBalance += job.recoverableAmount;
        snapshot.liquidityMetrics.updatedAt = timestamp;
        await writeSnapshot(this.path, snapshot);
        return job;
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
    listCommitmentRegistry() {
        return this.client.get("/commitment-registry");
    }
    listClaimPointLedger() {
        return this.client.get("/claim-points");
    }
    listClaimLeases() {
        return this.client.get("/claim-leases");
    }
    listRecoveryQueue(params = {}) {
        const search = new URLSearchParams();
        if (params.status)
            search.set("status", params.status);
        const query = search.toString();
        return this.client.get(`/recovery-queue${query ? `?${query}` : ""}`);
    }
    getLiquidityMetrics() {
        return this.client.get("/liquidity-metrics");
    }
    submitIntentVerification(id, crankerPubkey, patch = {}) {
        return this.client.post(`/intents/${encodeURIComponent(id)}/verify`, {
            ...patch,
            crankerPubkey,
        });
    }
    acquireClaimLease(intentId, crankerPubkey) {
        return this.client.post(`/intents/${encodeURIComponent(intentId)}/claim-lease`, { crankerPubkey });
    }
    completeRecoveryJob(jobId, crankerPubkey, proofTx) {
        return this.client.post(`/recovery-queue/${encodeURIComponent(jobId)}/complete`, {
            crankerPubkey,
            proofTx,
        });
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
