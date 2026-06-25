import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { computeTinOperationFeeSplitBaseUnits } from "./contracts.js";
import { TsnHttpClient } from "./client.js";
const TIN_CREATION_FEE_BASE_UNITS = 50000n;
const TIN_UPDATE_FEE_BASE_UNITS = 10000n;
function tinOperationFeeBaseUnits(operation) {
    const raw = operation.intentType === "tin_creation"
        ? operation.creationFeeAmount
        : operation.updateFeeAmount;
    if (!raw)
        return operation.intentType === "tin_creation" ? TIN_CREATION_FEE_BASE_UNITS : TIN_UPDATE_FEE_BASE_UNITS;
    const value = BigInt(raw);
    if (value <= 0n)
        throw new Error("TIN operation fee amount must be positive");
    return value;
}
function computeTinFeeCommitmentHash(operation, feeRecord) {
    return createHash("sha256")
        .update(JSON.stringify({
        domain: "TSN_TIN_FEE_COMMITMENT_V1",
        intentId: operation.intentId,
        intentType: operation.intentType,
        tin: operation.tin,
        ownerPubkey: operation.ownerPubkey,
        ownerIntentHash: operation.ownerIntentHash,
        feeMint: feeRecord.feeMint,
        grossAmount: feeRecord.grossAmount,
        verifierAmount: feeRecord.verifierAmount,
        submitterAmount: feeRecord.submitterAmount,
        treasuryAmount: feeRecord.treasuryAmount,
        bonusPoolAmount: feeRecord.bonusPoolAmount,
        verifierPubkey: feeRecord.verifierPubkey,
        submitterPubkey: feeRecord.submitterPubkey,
        treasuryPubkey: feeRecord.treasuryPubkey,
        bonusPoolPubkey: feeRecord.bonusPoolPubkey,
    }, Object.keys({
        bonusPoolAmount: null,
        bonusPoolPubkey: null,
        domain: null,
        feeMint: null,
        grossAmount: null,
        intentId: null,
        intentType: null,
        ownerIntentHash: null,
        ownerPubkey: null,
        submitterAmount: null,
        submitterPubkey: null,
        tin: null,
        treasuryAmount: null,
        treasuryPubkey: null,
        verifierAmount: null,
        verifierPubkey: null,
    }).sort()))
        .digest("hex");
}
function appendUniqueSignature(signatures, txSignature) {
    const ordered = [...(signatures ?? [])];
    if (!ordered.includes(txSignature))
        ordered.push(txSignature);
    return ordered;
}
function now() {
    return new Date().toISOString();
}
async function readSnapshot(path) {
    try {
        return JSON.parse(await readFile(path, "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return { intents: [], claimRequests: [], proofs: [], recoveries: [], epochChallenges: [] };
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
            pruLifecycle: request.recipientPruIndex === null || request.recipientPruIndex === undefined ? [] : [{
                    tinId: request.recipientTin ?? request.recipientHash,
                    tokenMint: request.tokenMintAddress,
                    pruIndex: request.recipientPruIndex,
                    transition: "receive",
                    txId: request.paymentId,
                    amount: request.amount,
                }],
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
    async publishEpochChallenge(challenge) {
        const snapshot = await readSnapshot(this.path);
        if (!snapshot.epochChallenges)
            snapshot.epochChallenges = [];
        const id = challenge.id ?? `${challenge.epoch}:${challenge.tokenMintAddress ?? "native"}`;
        const existing = snapshot.epochChallenges.find((candidate) => candidate.id === id);
        if (existing) {
            Object.assign(existing, challenge, { id, updatedAt: now() });
            await writeSnapshot(this.path, snapshot);
            return existing;
        }
        const timestamp = now();
        const record = {
            ...challenge,
            id,
            status: challenge.status ?? "open",
            postedAt: timestamp,
            updatedAt: timestamp,
        };
        snapshot.epochChallenges.push(record);
        await writeSnapshot(this.path, snapshot);
        return record;
    }
    async listOpenEpochChallenges(limit = 20) {
        const snapshot = await readSnapshot(this.path);
        return (snapshot.epochChallenges ?? [])
            .filter((challenge) => challenge.status === "open" || challenge.status === "failed")
            .sort((left, right) => left.postedAt.localeCompare(right.postedAt))
            .slice(0, limit);
    }
    async updateEpochChallengeStatus(id, status, patch = {}) {
        const snapshot = await readSnapshot(this.path);
        const challenge = (snapshot.epochChallenges ?? []).find((candidate) => candidate.id === id);
        if (!challenge)
            return null;
        Object.assign(challenge, patch, { status, updatedAt: now() });
        await writeSnapshot(this.path, snapshot);
        return challenge;
    }
    async listTinVerificationWork(limit = 50) {
        const snapshot = await readSnapshot(this.path);
        return (snapshot.tinOperations ?? [])
            .filter((operation) => operation.status === "pending_verification" || operation.status === "verifier_assigned")
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
            .slice(0, limit);
    }
    async listTinFeeWork(operatorPubkey, limit = 50) {
        const snapshot = await readSnapshot(this.path);
        const allowSingle = process.env.TSN_ALLOW_SINGLE_CRANKER_TINS === "1";
        return (snapshot.tinOperations ?? [])
            .filter((operation) => operation.status === "verified" || operation.status === "fee_pending")
            .filter((operation) => allowSingle || operation.verifierCranker !== operatorPubkey)
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
            .slice(0, limit);
    }
    async listTinRegistryWork(operatorPubkey, limit = 50) {
        const snapshot = await readSnapshot(this.path);
        return (snapshot.tinOperations ?? [])
            .filter((operation) => operation.status === "fee_committed" || operation.status === "submitter_assigned")
            .filter((operation) => !operation.submitterCranker || operation.submitterCranker === operatorPubkey)
            .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
            .slice(0, limit);
    }
    async patchTinOperation(id, patch) {
        const snapshot = await readSnapshot(this.path);
        if (!snapshot.tinOperations)
            snapshot.tinOperations = [];
        const operation = snapshot.tinOperations.find((candidate) => candidate.intentId === id);
        if (!operation)
            return null;
        Object.assign(operation, patch, { updatedAt: now() });
        await writeSnapshot(this.path, snapshot);
        return operation;
    }
    markTinOperationVerified(id, crankerPubkey) {
        return this.patchTinOperation(id, {
            status: "verified",
            verifierCranker: crankerPubkey,
            failureReason: null,
        });
    }
    async markTinOperationFeeCommitted(id, crankerPubkey, feeCommitmentTx = null) {
        const snapshot = await readSnapshot(this.path);
        if (!snapshot.tinOperations)
            snapshot.tinOperations = [];
        const operation = snapshot.tinOperations.find((candidate) => candidate.intentId === id);
        if (!operation)
            return null;
        const gross = tinOperationFeeBaseUnits(operation);
        const split = computeTinOperationFeeSplitBaseUnits(gross);
        const timestamp = now();
        const feeMetadata = {
            intentId: id,
            feeMint: operation.intentType === "tin_creation"
                ? operation.creationFeeMint ?? process.env.TSN_TINS_FEE_MINT ?? "USDC"
                : operation.updateFeeMint ?? process.env.TSN_TINS_FEE_MINT ?? "USDC",
            grossAmount: gross.toString(),
            verifierAmount: split.verifier.toString(),
            submitterAmount: split.submitter.toString(),
            treasuryAmount: split.treasury.toString(),
            bonusPoolAmount: split.bonusPool.toString(),
            verifierPubkey: operation.verifierCranker ?? null,
            submitterPubkey: crankerPubkey,
            treasuryPubkey: process.env.TSN_TINS_TREASURY_PUBKEY ?? null,
            bonusPoolPubkey: process.env.TSN_TINS_BONUS_POOL_PUBKEY ?? null,
            feeCommitmentTx,
            feeCommitmentHash: "",
            status: "committed",
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        feeMetadata.feeCommitmentHash = computeTinFeeCommitmentHash(operation, feeMetadata);
        Object.assign(operation, {
            status: "fee_committed",
            submitterCranker: crankerPubkey,
            feeMetadata,
            updatedAt: timestamp,
        });
        await writeSnapshot(this.path, snapshot);
        return operation;
    }
    markTinOperationFeeCommittedPlaceholder(id, crankerPubkey, feeCommitmentTx = null) {
        return this.patchTinOperation(id, {
            status: "fee_committed",
            submitterCranker: crankerPubkey,
            feeMetadata: {
                intentId: id,
                feeMint: process.env.TSN_TINS_FEE_MINT ?? "USDC",
                grossAmount: "0",
                verifierAmount: "0",
                submitterAmount: "0",
                treasuryAmount: "0",
                bonusPoolAmount: "0",
                submitterPubkey: crankerPubkey,
                feeCommitmentTx,
                feeCommitmentHash: "",
                status: "committed",
                createdAt: now(),
                updatedAt: now(),
            },
        });
    }
    async markTinOperationSubmitted(id, crankerPubkey, txSignature) {
        const snapshot = await readSnapshot(this.path);
        if (!snapshot.tinOperations)
            snapshot.tinOperations = [];
        const operation = snapshot.tinOperations.find((candidate) => candidate.intentId === id);
        if (!operation)
            return null;
        Object.assign(operation, {
            status: "submitted_onchain",
            submitterCranker: crankerPubkey,
            onchainSignatures: appendUniqueSignature(operation.onchainSignatures, txSignature),
            updatedAt: now(),
        });
        await writeSnapshot(this.path, snapshot);
        return operation;
    }
    async markTinOperationFinalized(id, txSignature = null) {
        const snapshot = await readSnapshot(this.path);
        if (!snapshot.tinOperations)
            snapshot.tinOperations = [];
        const operation = snapshot.tinOperations.find((candidate) => candidate.intentId === id);
        if (!operation)
            return null;
        Object.assign(operation, {
            status: "finalized",
            ...(txSignature ? { onchainSignatures: appendUniqueSignature(operation.onchainSignatures, txSignature) } : {}),
            updatedAt: now(),
        });
        await writeSnapshot(this.path, snapshot);
        return operation;
    }
    markTinOperationFailed(id, reason) {
        return this.patchTinOperation(id, {
            status: "failed",
            failureReason: reason,
        });
    }
    async recordPruLifecycleMutation(intentId, mutation) {
        const snapshot = await readSnapshot(this.path);
        const intent = snapshot.intents.find((candidate) => candidate.id === intentId || candidate.paymentId === intentId);
        if (!intent)
            return null;
        intent.pruLifecycle = [...(intent.pruLifecycle ?? []), mutation];
        intent.updatedAt = now();
        await writeSnapshot(this.path, snapshot);
        return intent;
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
    publishEpochChallenge(challenge) {
        return this.client.post("/epoch-challenges", challenge);
    }
    listOpenEpochChallenges(limit = 20) {
        return this.client.get(`/epoch-challenges?status=open&limit=${limit}`);
    }
    updateEpochChallengeStatus(id, status, patch = {}) {
        return this.client.patch(`/epoch-challenges/${encodeURIComponent(id)}/status`, { ...patch, status });
    }
    listTinVerificationWork(limit = 50) {
        return this.client.get(`/tin-operations/verification-work?limit=${limit}`);
    }
    listTinFeeWork(operatorPubkey, limit = 50) {
        return this.client.get(`/tin-operations/fee-work?operator_pubkey=${encodeURIComponent(operatorPubkey)}&limit=${limit}`);
    }
    listTinRegistryWork(operatorPubkey, limit = 50) {
        return this.client.get(`/tin-operations/registry-work?operator_pubkey=${encodeURIComponent(operatorPubkey)}&limit=${limit}`);
    }
    markTinOperationVerified(id, crankerPubkey) {
        return this.client.post(`/tin-operations/${encodeURIComponent(id)}/verified`, { crankerPubkey });
    }
    markTinOperationFeeCommitted(id, crankerPubkey, feeCommitmentTx = null) {
        return this.client.post(`/tin-operations/${encodeURIComponent(id)}/fee-committed`, { crankerPubkey, feeCommitmentTx });
    }
    markTinOperationSubmitted(id, crankerPubkey, txSignature) {
        return this.client.post(`/tin-operations/${encodeURIComponent(id)}/submitted`, { crankerPubkey, txSignature });
    }
    markTinOperationFinalized(id, txSignature = null) {
        return this.client.post(`/tin-operations/${encodeURIComponent(id)}/finalized`, { txSignature });
    }
    markTinOperationFailed(id, reason) {
        return this.client.post(`/tin-operations/${encodeURIComponent(id)}/failed`, { failureReason: reason });
    }
    recordPruLifecycleMutation(intentId, mutation) {
        return this.client.post(`/intents/${encodeURIComponent(intentId)}/pru-lifecycle`, mutation);
    }
}
