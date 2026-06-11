import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  ClaimLeaseRecord,
  ClaimPointLedgerEntry,
  CommitmentRegistryEntry,
  CreateIntentRequest,
  LiquidityMetrics,
  ProofOfPaymentRequest,
  RecoveryQueueEntry,
  RequestClaimRequest,
  TsnClaimRequestStatus,
  TsnIntentStatus,
  TsnMempoolClaimRequest,
  TsnMempoolIntent,
  TsnIntentWorkItem,
  TsnWorkItem,
} from "./contracts.js";
import { TsnHttpClient } from "./client.js";
import {
  createEncryptedSettlementToken,
  createOneTimeDecryptionToken,
  currentTsnEpoch,
  settlementSha256Hex,
} from "./settlement-token.js";

export interface TsnMempool {
  postIntent(request: CreateIntentRequest): Promise<TsnMempoolIntent>;
  postClaimRequest(request: RequestClaimRequest): Promise<TsnMempoolClaimRequest>;
  listIntents(params?: { status?: TsnIntentStatus }): Promise<TsnMempoolIntent[]>;
  listClaimRequests(params?: { intentId?: string; status?: TsnClaimRequestStatus }): Promise<TsnMempoolClaimRequest[]>;
  listPendingIntentWork(limit?: number): Promise<TsnIntentWorkItem[]>;
  listPendingWork(limit?: number): Promise<TsnWorkItem[]>;
  listCommitmentRegistry(): Promise<CommitmentRegistryEntry[]>;
  listClaimPointLedger(): Promise<ClaimPointLedgerEntry[]>;
  listClaimLeases(): Promise<ClaimLeaseRecord[]>;
  listRecoveryQueue(params?: { status?: RecoveryQueueEntry["status"] }): Promise<RecoveryQueueEntry[]>;
  getLiquidityMetrics(): Promise<LiquidityMetrics>;
  submitIntentVerification(id: string, crankerPubkey: string, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent | null>;
  acquireClaimLease(intentId: string, crankerPubkey: string): Promise<ClaimLeaseRecord>;
  completeRecoveryJob(jobId: string, crankerPubkey: string, proofTx: string): Promise<RecoveryQueueEntry | null>;
  updateIntentStatus(id: string, status: TsnIntentStatus, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent | null>;
  updateClaimRequestStatus(
    id: string,
    status: TsnClaimRequestStatus,
    patch?: Partial<TsnMempoolClaimRequest>,
  ): Promise<TsnMempoolClaimRequest | null>;
  postProof(request: ProofOfPaymentRequest): Promise<ProofOfPaymentRequest>;
}

type Snapshot = {
  intents: TsnMempoolIntent[];
  claimRequests: TsnMempoolClaimRequest[];
  proofs?: ProofOfPaymentRequest[];
  commitmentRegistry?: CommitmentRegistryEntry[];
  claimPointLedger?: ClaimPointLedgerEntry[];
  claimLeases?: ClaimLeaseRecord[];
  recoveryQueue?: RecoveryQueueEntry[];
  liquidityMetrics?: LiquidityMetrics;
};

function now() {
  return new Date().toISOString();
}

function defaultLiquidityMetrics(): LiquidityMetrics {
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

function normalizeSnapshot(snapshot: Snapshot): Snapshot {
  snapshot.proofs ??= [];
  snapshot.commitmentRegistry ??= [];
  snapshot.claimPointLedger ??= [];
  snapshot.claimLeases ??= [];
  snapshot.recoveryQueue ??= [];
  snapshot.liquidityMetrics ??= defaultLiquidityMetrics();
  return snapshot;
}

async function readSnapshot(path: string): Promise<Snapshot> {
  try {
    return normalizeSnapshot(JSON.parse(await readFile(path, "utf8")) as Snapshot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return normalizeSnapshot({ intents: [], claimRequests: [], proofs: [] });
    }
    throw error;
  }
}

async function writeSnapshot(path: string, snapshot: Snapshot) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalizeSnapshot(snapshot), null, 2)}\n`, "utf8");
}

function ensureSettlementToken(request: CreateIntentRequest): CreateIntentRequest {
  if (request.encryptedSettlementToken && request.settlementTokenCommitmentHash) return request;
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

function registryEntryForIntent(intent: TsnMempoolIntent): CommitmentRegistryEntry {
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

function getLedger(snapshot: Snapshot, crankerPubkey: string) {
  snapshot.claimPointLedger ??= [];
  let entry = snapshot.claimPointLedger.find((candidate) => candidate.crankerPubkey === crankerPubkey);
  if (!entry) {
    entry = { crankerPubkey, earned: 0, available: 0, leased: 0, lastIntentWorkAt: null };
    snapshot.claimPointLedger.push(entry);
  }
  return entry;
}

function refreshLiquidityMetrics(snapshot: Snapshot) {
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

function recoveryPriority(metrics: LiquidityMetrics, jobAmount: number) {
  const deficit = Math.max(0, metrics.lowLiquidityThreshold - metrics.activeLiquidity);
  return Number((deficit * 10 + metrics.pendingIntentAmount * 2 + metrics.settlementVelocity + jobAmount).toFixed(6));
}

export class JsonFileTsnMempool implements TsnMempool {
  private readonly path: string;

  constructor(path = process.env.TSN_MEMPOOL_FILE ?? ".tsn/mempool.json") {
    this.path = resolve(process.cwd(), path);
  }

  async postIntent(request: CreateIntentRequest): Promise<TsnMempoolIntent> {
    const snapshot = await readSnapshot(this.path);
    const existing = snapshot.intents.find((intent) => intent.paymentId === request.paymentId);
    if (existing) return existing;

    const timestamp = now();
    const securedRequest = ensureSettlementToken(request);
    const intent: TsnMempoolIntent = {
      ...securedRequest,
      id: securedRequest.paymentId,
      status: "pending",
      postedAt: timestamp,
      updatedAt: timestamp,
    };
    snapshot.intents.push(intent);
    snapshot.commitmentRegistry!.push(registryEntryForIntent(intent));
    refreshLiquidityMetrics(snapshot);
    await writeSnapshot(this.path, snapshot);
    return intent;
  }

  async postClaimRequest(request: RequestClaimRequest): Promise<TsnMempoolClaimRequest> {
    const snapshot = await readSnapshot(this.path);
    const existing = snapshot.claimRequests.find(
      (claimRequest) => claimRequest.intentId === request.intentId && claimRequest.status !== "failed" && claimRequest.status !== "canceled",
    );
    if (existing) return existing;

    const timestamp = now();
    const claimRequest: TsnMempoolClaimRequest = {
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

  async listIntents(params: { status?: TsnIntentStatus } = {}): Promise<TsnMempoolIntent[]> {
    const snapshot = await readSnapshot(this.path);
    const items = params.status
      ? snapshot.intents.filter((intent) => intent.status === params.status)
      : snapshot.intents;
    return [...items].sort((left, right) => left.postedAt.localeCompare(right.postedAt));
  }

  async listClaimRequests(params: { intentId?: string; status?: TsnClaimRequestStatus } = {}): Promise<TsnMempoolClaimRequest[]> {
    const snapshot = await readSnapshot(this.path);
    const items = snapshot.claimRequests.filter((claimRequest) => {
      if (params.intentId && claimRequest.intentId !== params.intentId) return false;
      if (params.status && claimRequest.status !== params.status) return false;
      return true;
    });
    return [...items].sort((left, right) => left.postedAt.localeCompare(right.postedAt));
  }

  async listPendingWork(limit = 50): Promise<TsnWorkItem[]> {
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

  async listPendingIntentWork(limit = 50): Promise<TsnIntentWorkItem[]> {
    const snapshot = await readSnapshot(this.path);
    return snapshot.intents
      .filter((intent) => intent.status === "pending")
      .sort((left, right) => left.postedAt.localeCompare(right.postedAt))
      .slice(0, limit)
      .map((intent) => ({ intent }));
  }

  async listCommitmentRegistry() {
    return (await readSnapshot(this.path)).commitmentRegistry!;
  }

  async listClaimPointLedger() {
    return (await readSnapshot(this.path)).claimPointLedger!;
  }

  async listClaimLeases() {
    return (await readSnapshot(this.path)).claimLeases!;
  }

  async listRecoveryQueue(params: { status?: RecoveryQueueEntry["status"] } = {}) {
    const queue = (await readSnapshot(this.path)).recoveryQueue!;
    return params.status ? queue.filter((entry) => entry.status === params.status) : queue;
  }

  async getLiquidityMetrics() {
    const snapshot = await readSnapshot(this.path);
    const metrics = refreshLiquidityMetrics(snapshot);
    await writeSnapshot(this.path, snapshot);
    return metrics;
  }

  async submitIntentVerification(id: string, crankerPubkey: string, patch: Partial<TsnMempoolIntent> = {}) {
    const snapshot = await readSnapshot(this.path);
    const intent = snapshot.intents.find((candidate) => candidate.id === id);
    if (!intent) return null;
    if (!intent.encryptedSettlementToken || !intent.settlementTokenCommitmentHash) {
      throw new Error("Intent verification failed: encrypted settlement token commitment is missing");
    }
    const registryEntry = snapshot.commitmentRegistry!.find((entry) => entry.transferId === id);
    if (!registryEntry) snapshot.commitmentRegistry!.push(registryEntryForIntent(intent));
    Object.assign(intent, patch, {
      status: "escrowed" as TsnIntentStatus,
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

  async acquireClaimLease(intentId: string, crankerPubkey: string) {
    const snapshot = await readSnapshot(this.path);
    const registryEntry = snapshot.commitmentRegistry!.find((entry) => entry.transferId === intentId);
    if (!registryEntry) throw new Error("Commitment registry entry not found");
    if (registryEntry.recoverable) throw new Error("Transfer is already recoverable; no claim lease is permitted");
    if (registryEntry.otdtHash) throw new Error("OTDT has already been issued for this transfer");
    const existingLease = snapshot.claimLeases!.find((lease) => lease.transferId === intentId && lease.status === "active" && Date.parse(lease.expiresAt) > Date.now());
    if (existingLease) return existingLease;
    const ledger = getLedger(snapshot, crankerPubkey);
    if (ledger.available < 1) throw new Error("Cranker has no available claim points for a claim lease");
    ledger.available -= 1;
    ledger.leased += 1;
    const issuedAt = now();
    const lease: ClaimLeaseRecord = {
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
    snapshot.claimLeases!.push(lease);
    const intent = snapshot.intents.find((candidate) => candidate.id === intentId);
    if (intent) Object.assign(intent, { status: "claimed" as TsnIntentStatus, claimLeaseId: lease.id, updatedAt: now() });
    await writeSnapshot(this.path, snapshot);
    return lease;
  }

  async updateIntentStatus(id: string, status: TsnIntentStatus, patch: Partial<TsnMempoolIntent> = {}) {
    const snapshot = await readSnapshot(this.path);
    const intent = snapshot.intents.find((candidate) => candidate.id === id);
    if (!intent) return null;
    Object.assign(intent, patch, { status, updatedAt: now() });
    refreshLiquidityMetrics(snapshot);
    await writeSnapshot(this.path, snapshot);
    return intent;
  }

  async updateClaimRequestStatus(id: string, status: TsnClaimRequestStatus, patch: Partial<TsnMempoolClaimRequest> = {}) {
    const snapshot = await readSnapshot(this.path);
    const claimRequest = snapshot.claimRequests.find((candidate) => candidate.id === id);
    if (!claimRequest) return null;
    Object.assign(claimRequest, patch, { status, updatedAt: now() });
    await writeSnapshot(this.path, snapshot);
    return claimRequest;
  }

  async postProof(request: ProofOfPaymentRequest): Promise<ProofOfPaymentRequest> {
    const snapshot = await readSnapshot(this.path);
    snapshot.proofs!.push(request);
    const intent = snapshot.intents.find((candidate) => candidate.id === request.intent_id);
    const registryEntry = snapshot.commitmentRegistry!.find((candidate) => candidate.transferId === request.intent_id);
    if (!registryEntry) throw new Error("Commitment registry entry not found for proof");
    if (registryEntry.recoverable) throw new Error("Transfer is already recoverable");
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
        status: "executed" as TsnIntentStatus,
        proofTxSig: request.proof_tx,
        updatedAt: now(),
      });
    }
    const lease = snapshot.claimLeases!.find((candidate) => candidate.transferId === request.intent_id && candidate.status === "active");
    if (lease) Object.assign(lease, { status: "completed", completedAt: now() });
    const claim = snapshot.claimRequests.find((candidate) => candidate.intentId === request.intent_id && candidate.status !== "completed");
    if (claim) Object.assign(claim, { status: "completed" as TsnClaimRequestStatus, updatedAt: now() });
    const metrics = refreshLiquidityMetrics(snapshot);
    if (!snapshot.recoveryQueue!.some((entry) => entry.transferId === request.intent_id)) {
      const amount = Number(intent?.amount ?? 0);
      const reward = Number((amount * Number(process.env.TSN_RECOVERY_REWARD_BPS ?? 200) / 10_000).toFixed(9));
      const timestamp = now();
      snapshot.recoveryQueue!.push({
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

  async completeRecoveryJob(jobId: string, crankerPubkey: string, proofTx: string) {
    const snapshot = await readSnapshot(this.path);
    const job = snapshot.recoveryQueue!.find((candidate) => candidate.id === jobId);
    if (!job || job.status === "completed") return job ?? null;
    const timestamp = now();
    Object.assign(job, {
      status: "completed" as const,
      leasedByCrankerPubkey: crankerPubkey,
      proofTx,
      updatedAt: timestamp,
    });
    const registryEntry = snapshot.commitmentRegistry!.find((entry) => entry.transferId === job.transferId);
    if (registryEntry) Object.assign(registryEntry, { recoveryProofTx: proofTx, updatedAt: timestamp });
    snapshot.liquidityMetrics ??= defaultLiquidityMetrics();
    snapshot.liquidityMetrics.activeLiquidity += job.recoverableAmount;
    snapshot.liquidityMetrics.vaultBalance += job.recoverableAmount;
    snapshot.liquidityMetrics.updatedAt = timestamp;
    await writeSnapshot(this.path, snapshot);
    return job;
  }
}

export class HttpTsnMempool implements TsnMempool {
  private readonly client: TsnHttpClient;

  constructor(baseUrl = process.env.TSN_MEMPOOL_URL) {
    if (!baseUrl) {
      throw new Error("TSN_MEMPOOL_URL is required for HttpTsnMempool");
    }
    this.client = new TsnHttpClient({ baseUrl });
  }

  postIntent(request: CreateIntentRequest): Promise<TsnMempoolIntent> {
    return this.client.postIntent<CreateIntentRequest, TsnMempoolIntent>(request);
  }

  postClaimRequest(request: RequestClaimRequest): Promise<TsnMempoolClaimRequest> {
    return this.client.postClaimRequest<RequestClaimRequest, TsnMempoolClaimRequest>(request);
  }

  listIntents(params: { status?: TsnIntentStatus } = {}): Promise<TsnMempoolIntent[]> {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    const query = search.toString();
    return this.client.get<TsnMempoolIntent[]>(`/intents${query ? `?${query}` : ""}`);
  }

  listClaimRequests(params: { intentId?: string; status?: TsnClaimRequestStatus } = {}): Promise<TsnMempoolClaimRequest[]> {
    const search = new URLSearchParams();
    if (params.intentId) search.set("intent_id", params.intentId);
    if (params.status) search.set("status", params.status);
    const query = search.toString();
    return this.client.get<TsnMempoolClaimRequest[]>(`/claim-requests${query ? `?${query}` : ""}`);
  }

  listPendingWork(limit = 50): Promise<TsnWorkItem[]> {
    return this.client.listPendingWork<TsnWorkItem[]>(limit);
  }

  listPendingIntentWork(limit = 50): Promise<TsnIntentWorkItem[]> {
    return this.client.listPendingIntentWork<TsnIntentWorkItem[]>(limit);
  }

  listCommitmentRegistry(): Promise<CommitmentRegistryEntry[]> {
    return this.client.get<CommitmentRegistryEntry[]>("/commitment-registry");
  }

  listClaimPointLedger(): Promise<ClaimPointLedgerEntry[]> {
    return this.client.get<ClaimPointLedgerEntry[]>("/claim-points");
  }

  listClaimLeases(): Promise<ClaimLeaseRecord[]> {
    return this.client.get<ClaimLeaseRecord[]>("/claim-leases");
  }

  listRecoveryQueue(params: { status?: RecoveryQueueEntry["status"] } = {}): Promise<RecoveryQueueEntry[]> {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    const query = search.toString();
    return this.client.get<RecoveryQueueEntry[]>(`/recovery-queue${query ? `?${query}` : ""}`);
  }

  getLiquidityMetrics(): Promise<LiquidityMetrics> {
    return this.client.get<LiquidityMetrics>("/liquidity-metrics");
  }

  submitIntentVerification(id: string, crankerPubkey: string, patch: Partial<TsnMempoolIntent> = {}) {
    return this.client.post<Partial<TsnMempoolIntent> & { crankerPubkey: string }, TsnMempoolIntent>(`/intents/${encodeURIComponent(id)}/verify`, {
      ...patch,
      crankerPubkey,
    });
  }

  acquireClaimLease(intentId: string, crankerPubkey: string) {
    return this.client.post<{ crankerPubkey: string }, ClaimLeaseRecord>(`/intents/${encodeURIComponent(intentId)}/claim-lease`, { crankerPubkey });
  }

  completeRecoveryJob(jobId: string, crankerPubkey: string, proofTx: string) {
    return this.client.post<{ crankerPubkey: string; proofTx: string }, RecoveryQueueEntry>(`/recovery-queue/${encodeURIComponent(jobId)}/complete`, {
      crankerPubkey,
      proofTx,
    });
  }

  updateIntentStatus(id: string, status: TsnIntentStatus, patch: Partial<TsnMempoolIntent> = {}) {
    return this.client.updateIntentStatus<Partial<TsnMempoolIntent> & { status: TsnIntentStatus }, TsnMempoolIntent>(id, {
      ...patch,
      status,
    });
  }

  updateClaimRequestStatus(id: string, status: TsnClaimRequestStatus, patch: Partial<TsnMempoolClaimRequest> = {}) {
    return this.client.updateClaimRequestStatus<
      Partial<TsnMempoolClaimRequest> & { status: TsnClaimRequestStatus },
      TsnMempoolClaimRequest
    >(id, {
      ...patch,
      status,
    });
  }

  postProof(request: ProofOfPaymentRequest): Promise<ProofOfPaymentRequest> {
    return this.client.postProof<ProofOfPaymentRequest, ProofOfPaymentRequest>(request);
  }
}
