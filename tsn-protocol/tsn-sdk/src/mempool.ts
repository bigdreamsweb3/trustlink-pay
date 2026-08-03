import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { computeTinOperationFeeSplitBaseUnits } from "./contracts.js";
import type {
  CreateIntentRequest,
  RequestClaimRequest,
  TsnClaimRequestStatus,
  TsnIntentStatus,
  TsnMempoolClaimRequest,
  TsnMempoolIntent,
  TsnIntentWorkItem,
  TsnRecoveryStatus,
  TsnEpochChallenge,
  TsnRecoveryWorkItem,
  TsnTinOperationRecord,
  TsnWorkItem,
  ProofOfPaymentRequest,
  PruLifecycleMutation,
} from "./contracts.js";
import { TsnHttpClient } from "./client.js";

const TIN_CREATION_FEE_BASE_UNITS = 50_000n;
const TIN_UPDATE_FEE_BASE_UNITS = 10_000n;

function tinOperationFeeBaseUnits(operation: TsnTinOperationRecord) {
  const raw = operation.intentType === "tin_creation"
    ? operation.creationFeeAmount
    : operation.updateFeeAmount;
  if (!raw) return operation.intentType === "tin_creation" ? TIN_CREATION_FEE_BASE_UNITS : TIN_UPDATE_FEE_BASE_UNITS;
  const value = BigInt(raw);
  if (value <= 0n) throw new Error("TIN operation fee amount must be positive");
  return value;
}

function computeTinFeeCommitmentHash(operation: TsnTinOperationRecord, feeRecord: Record<string, unknown>) {
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
      teamAmount: feeRecord.teamAmount,
      reservePoolAmount: feeRecord.reservePoolAmount,
      verifierPubkey: feeRecord.verifierPubkey,
      submitterPubkey: feeRecord.submitterPubkey,
      teamPubkey: feeRecord.teamPubkey,
      reservePoolPubkey: feeRecord.reservePoolPubkey,
    }, Object.keys({
      domain: null,
      feeMint: null,
      grossAmount: null,
      intentId: null,
      intentType: null,
      ownerIntentHash: null,
      ownerPubkey: null,
      reservePoolAmount: null,
      reservePoolPubkey: null,
      submitterAmount: null,
      submitterPubkey: null,
      teamAmount: null,
      teamPubkey: null,
      tin: null,
      verifierAmount: null,
      verifierPubkey: null,
    }).sort()))
    .digest("hex");
}

function appendUniqueSignature(signatures: string[] | undefined, txSignature: string) {
  const ordered = [...(signatures ?? [])];
  if (!ordered.includes(txSignature)) ordered.push(txSignature);
  return ordered;
}

export interface TsnMempool {
  postIntent(request: CreateIntentRequest): Promise<TsnMempoolIntent>;
  postClaimRequest(request: RequestClaimRequest): Promise<TsnMempoolClaimRequest>;
  listIntents(params?: { status?: TsnIntentStatus }): Promise<TsnMempoolIntent[]>;
  listClaimRequests(params?: { intentId?: string; status?: TsnClaimRequestStatus }): Promise<TsnMempoolClaimRequest[]>;
  listPendingIntentWork(limit?: number): Promise<TsnIntentWorkItem[]>;
  listPendingWork(limit?: number): Promise<TsnWorkItem[]>;
  updateIntentStatus(id: string, status: TsnIntentStatus, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent | null>;
  updateClaimRequestStatus(
    id: string,
    status: TsnClaimRequestStatus,
    patch?: Partial<TsnMempoolClaimRequest>,
  ): Promise<TsnMempoolClaimRequest | null>;
  postProof(request: ProofOfPaymentRequest): Promise<ProofOfPaymentRequest>;
  listPendingRecoveryWork(operatorPubkey: string, limit?: number): Promise<TsnRecoveryWorkItem[]>;
  claimRecoveryLease(id: string, operatorPubkey: string): Promise<TsnRecoveryWorkItem>;
  updateRecoveryStatus(
    id: string,
    operatorPubkey: string,
    status: TsnRecoveryStatus,
    patch?: Partial<TsnRecoveryWorkItem>,
  ): Promise<TsnRecoveryWorkItem | null>;
  publishEpochChallenge(challenge: Omit<TsnEpochChallenge, "id" | "status" | "postedAt" | "updatedAt"> & { id?: string; status?: TsnEpochChallenge["status"] }): Promise<TsnEpochChallenge>;
  listOpenEpochChallenges(limit?: number): Promise<TsnEpochChallenge[]>;
  updateEpochChallengeStatus(id: string, status: TsnEpochChallenge["status"], patch?: Partial<TsnEpochChallenge>): Promise<TsnEpochChallenge | null>;
  listTinVerificationWork(limit?: number): Promise<TsnTinOperationRecord[]>;
  listTinFeeWork(operatorPubkey: string, limit?: number): Promise<TsnTinOperationRecord[]>;
  listTinRegistryWork(operatorPubkey: string, limit?: number): Promise<TsnTinOperationRecord[]>;
  markTinOperationVerified(id: string, crankerPubkey: string): Promise<TsnTinOperationRecord | null>;
  markTinOperationFeeCommitted(id: string, crankerPubkey: string, feeCommitmentTx?: string | null): Promise<TsnTinOperationRecord | null>;
  markTinOperationSubmitted(id: string, crankerPubkey: string, txSignature: string): Promise<TsnTinOperationRecord | null>;
  markTinOperationFinalized(id: string, txSignature?: string | null): Promise<TsnTinOperationRecord | null>;
  markTinOperationFailed(id: string, reason: string): Promise<TsnTinOperationRecord | null>;
  recordPruLifecycleMutation(intentId: string, mutation: PruLifecycleMutation): Promise<TsnMempoolIntent | null>;
}

type Snapshot = {
  intents: TsnMempoolIntent[];
  claimRequests: TsnMempoolClaimRequest[];
  proofs?: ProofOfPaymentRequest[];
  recoveries?: TsnRecoveryWorkItem[];
  epochChallenges?: TsnEpochChallenge[];
  tinOperations?: TsnTinOperationRecord[];
};

function now() {
  return new Date().toISOString();
}

async function readSnapshot(path: string): Promise<Snapshot> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { intents: [], claimRequests: [], proofs: [], recoveries: [], epochChallenges: [] };
    }
    throw error;
  }
}

async function writeSnapshot(path: string, snapshot: Snapshot) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

/** @internal Isolated legacy test fixture. Never exported or used by TSN runtime services. */
class JsonFileTsnMempool implements TsnMempool {
  private readonly path: string;

  constructor(path = process.env.TSN_MEMPOOL_FILE ?? ".tsn/mempool.json") {
    this.path = resolve(process.cwd(), path);
  }

  async postIntent(request: CreateIntentRequest): Promise<TsnMempoolIntent> {
    const snapshot = await readSnapshot(this.path);
    const existing = snapshot.intents.find((intent) => intent.paymentId === request.paymentId);
    if (existing) return existing;

    const timestamp = now();
    const intent: TsnMempoolIntent = {
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

  async updateIntentStatus(id: string, status: TsnIntentStatus, patch: Partial<TsnMempoolIntent> = {}) {
    const snapshot = await readSnapshot(this.path);
    const intent = snapshot.intents.find((candidate) => candidate.id === id);
    if (!intent) return null;
    Object.assign(intent, patch, { status, updatedAt: now() });
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
    if (!snapshot.proofs) snapshot.proofs = [];
    if (!snapshot.recoveries) snapshot.recoveries = [];
    snapshot.proofs.push(request);
    const intent = snapshot.intents.find((candidate) => candidate.id === request.intent_id);
    if (intent && ["escrowed", "onchain", "claimed"].includes(intent.status)) {
      Object.assign(intent, {
        status: "executed" as TsnIntentStatus,
        proofTxSig: request.proof_tx,
        updatedAt: now(),
      });
      if (
        intent.transferId &&
        intent.settlementPaymentIntentId &&
        intent.settlementVault &&
        intent.settlementTokenAccount &&
        !snapshot.recoveries.some((item) => item.id === intent.id)
      ) {
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

  async listPendingRecoveryWork(operatorPubkey: string, limit = 20) {
    const snapshot = await readSnapshot(this.path);
    const now = Date.now();
    return (snapshot.recoveries ?? [])
      .filter((item) => {
        if (item.status === "pending") return true;
        if (item.status !== "leased") return false;
        if (item.assignedCrankerPubkey === operatorPubkey) return true;
        return item.leaseExpiresAt ? Date.parse(item.leaseExpiresAt) <= now : false;
      })
      .sort((left, right) => right.priorityScore - left.priorityScore)
      .slice(0, limit);
  }

  async claimRecoveryLease(id: string, operatorPubkey: string) {
    const snapshot = await readSnapshot(this.path);
    const item = (snapshot.recoveries ?? []).find((candidate) => candidate.id === id);
    if (!item) throw new Error(`Recovery ${id} not found`);
    const now = Date.now();
    const heldByAnother =
      item.status === "leased" &&
      item.assignedCrankerPubkey !== operatorPubkey &&
      (!item.leaseExpiresAt || Date.parse(item.leaseExpiresAt) > now);
    if (heldByAnother) throw new Error(`Recovery ${id} is leased by another Cranker`);
    Object.assign(item, {
      status: "leased" as const,
      assignedCrankerPubkey: operatorPubkey,
      leaseExpiresAt: new Date(now + 5 * 60_000).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    await writeSnapshot(this.path, snapshot);
    return item;
  }

  async updateRecoveryStatus(
    id: string,
    operatorPubkey: string,
    status: TsnRecoveryStatus,
    patch: Partial<TsnRecoveryWorkItem> = {},
  ) {
    const snapshot = await readSnapshot(this.path);
    const item = (snapshot.recoveries ?? []).find((candidate) => candidate.id === id);
    if (!item) return null;
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

  async publishEpochChallenge(
    challenge: Omit<TsnEpochChallenge, "id" | "status" | "postedAt" | "updatedAt"> & {
      id?: string;
      status?: TsnEpochChallenge["status"];
    },
  ) {
    const snapshot = await readSnapshot(this.path);
    if (!snapshot.epochChallenges) snapshot.epochChallenges = [];
    const id = challenge.id ?? `${challenge.epoch}:${challenge.tokenMintAddress ?? "native"}`;
    const existing = snapshot.epochChallenges.find((candidate) => candidate.id === id);
    if (existing) {
      Object.assign(existing, challenge, { id, updatedAt: now() });
      await writeSnapshot(this.path, snapshot);
      return existing;
    }
    const timestamp = now();
    const record: TsnEpochChallenge = {
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

  async updateEpochChallengeStatus(
    id: string,
    status: TsnEpochChallenge["status"],
    patch: Partial<TsnEpochChallenge> = {},
  ) {
    const snapshot = await readSnapshot(this.path);
    const challenge = (snapshot.epochChallenges ?? []).find((candidate) => candidate.id === id);
    if (!challenge) return null;
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

  async listTinFeeWork(operatorPubkey: string, limit = 50) {
    const snapshot = await readSnapshot(this.path);
    const allowSingle = process.env.TSN_ALLOW_SINGLE_CRANKER_TINS === "1";
    return (snapshot.tinOperations ?? [])
      .filter((operation) => operation.status === "verified" || operation.status === "fee_pending")
      .filter((operation) => allowSingle || operation.verifierCranker !== operatorPubkey)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit);
  }

  async listTinRegistryWork(operatorPubkey: string, limit = 50) {
    const snapshot = await readSnapshot(this.path);
    return (snapshot.tinOperations ?? [])
      .filter((operation) => operation.status === "fee_committed" || operation.status === "submitter_assigned")
      .filter((operation) => !operation.submitterCranker || operation.submitterCranker === operatorPubkey)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(0, limit);
  }

  private async patchTinOperation(id: string, patch: Partial<TsnTinOperationRecord>) {
    const snapshot = await readSnapshot(this.path);
    if (!snapshot.tinOperations) snapshot.tinOperations = [];
    const operation = snapshot.tinOperations.find((candidate) => candidate.intentId === id);
    if (!operation) return null;
    Object.assign(operation, patch, { updatedAt: now() });
    await writeSnapshot(this.path, snapshot);
    return operation;
  }

  markTinOperationVerified(id: string, crankerPubkey: string) {
    return this.patchTinOperation(id, {
      status: "verified",
      verifierCranker: crankerPubkey,
      failureReason: null,
    });
  }

  async markTinOperationFeeCommitted(id: string, crankerPubkey: string, feeCommitmentTx: string | null = null) {
    const snapshot = await readSnapshot(this.path);
    if (!snapshot.tinOperations) snapshot.tinOperations = [];
    const operation = snapshot.tinOperations.find((candidate) => candidate.intentId === id);
    if (!operation) return null;
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
      teamAmount: split.team.toString(),
      reservePoolAmount: split.reservePool.toString(),
      verifierPubkey: operation.verifierCranker ?? null,
      submitterPubkey: crankerPubkey,
      teamPubkey: process.env.TSN_TINS_TEAM_PUBKEY ?? process.env.TSN_TINS_TREASURY_PUBKEY ?? null,
      reservePoolPubkey: process.env.TSN_TINS_RESERVE_POOL_PUBKEY ?? process.env.TSN_TINS_BONUS_POOL_PUBKEY ?? null,
      feeCommitmentTx,
      feeCommitmentHash: "",
      status: "committed" as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    feeMetadata.feeCommitmentHash = computeTinFeeCommitmentHash(operation, feeMetadata);
    Object.assign(operation, {
      status: "fee_committed" as const,
      submitterCranker: crankerPubkey,
      feeMetadata,
      updatedAt: timestamp,
    });
    await writeSnapshot(this.path, snapshot);
    return operation;
  }

  markTinOperationFeeCommittedPlaceholder(id: string, crankerPubkey: string, feeCommitmentTx: string | null = null) {
    return this.patchTinOperation(id, {
      status: "fee_committed",
      submitterCranker: crankerPubkey,
      feeMetadata: {
        intentId: id,
        feeMint: process.env.TSN_TINS_FEE_MINT ?? "USDC",
        grossAmount: "0",
        verifierAmount: "0",
        submitterAmount: "0",
        teamAmount: "0",
        reservePoolAmount: "0",
        submitterPubkey: crankerPubkey,
        feeCommitmentTx,
        feeCommitmentHash: "",
        status: "committed",
        createdAt: now(),
        updatedAt: now(),
      },
    });
  }

  async markTinOperationSubmitted(id: string, crankerPubkey: string, txSignature: string) {
    const snapshot = await readSnapshot(this.path);
    if (!snapshot.tinOperations) snapshot.tinOperations = [];
    const operation = snapshot.tinOperations.find((candidate) => candidate.intentId === id);
    if (!operation) return null;
    Object.assign(operation, {
      status: "submitted_onchain",
      submitterCranker: crankerPubkey,
      onchainSignatures: appendUniqueSignature(operation.onchainSignatures, txSignature),
      updatedAt: now(),
    });
    await writeSnapshot(this.path, snapshot);
    return operation;
  }

  async markTinOperationFinalized(id: string, txSignature: string | null = null) {
    const snapshot = await readSnapshot(this.path);
    if (!snapshot.tinOperations) snapshot.tinOperations = [];
    const operation = snapshot.tinOperations.find((candidate) => candidate.intentId === id);
    if (!operation) return null;
    Object.assign(operation, {
      status: "finalized",
      ...(txSignature ? { onchainSignatures: appendUniqueSignature(operation.onchainSignatures, txSignature) } : {}),
      updatedAt: now(),
    });
    await writeSnapshot(this.path, snapshot);
    return operation;
  }

  markTinOperationFailed(id: string, reason: string) {
    return this.patchTinOperation(id, {
      status: "failed",
      failureReason: reason,
    });
  }

  async recordPruLifecycleMutation(intentId: string, mutation: PruLifecycleMutation) {
    const snapshot = await readSnapshot(this.path);
    const intent = snapshot.intents.find((candidate) => candidate.id === intentId || candidate.paymentId === intentId);
    if (!intent) return null;
    intent.pruLifecycle = [...(intent.pruLifecycle ?? []), mutation];
    intent.updatedAt = now();
    await writeSnapshot(this.path, snapshot);
    return intent;
  }
}


export class HttpTsnMempool implements TsnMempool {
  private readonly client: TsnHttpClient;

  constructor(
    baseUrl = process.env.TSN_MEMPOOL_URL,
    apiKey = process.env.TSN_MEMPOOL_API_KEY,
  ) {
    if (!baseUrl) {
      throw new Error("TSN_MEMPOOL_URL is required for HttpTsnMempool");
    }
    this.client = new TsnHttpClient({ baseUrl, apiKey });
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

  listPendingRecoveryWork(operatorPubkey: string, limit = 20) {
    return this.client.listRecoveryWork<TsnRecoveryWorkItem[]>(operatorPubkey, limit);
  }

  claimRecoveryLease(id: string, operatorPubkey: string) {
    return this.client.claimRecoveryLease<
      { operatorPubkey: string },
      TsnRecoveryWorkItem
    >(id, { operatorPubkey });
  }

  updateRecoveryStatus(
    id: string,
    operatorPubkey: string,
    status: TsnRecoveryStatus,
    patch: Partial<TsnRecoveryWorkItem> = {},
  ) {
    return this.client.updateRecoveryStatus<
      Partial<TsnRecoveryWorkItem> & {
        operatorPubkey: string;
        status: TsnRecoveryStatus;
      },
      TsnRecoveryWorkItem
    >(id, {
      ...patch,
      operatorPubkey,
      status,
    });
  }

  publishEpochChallenge(
    challenge: Omit<TsnEpochChallenge, "id" | "status" | "postedAt" | "updatedAt"> & {
      id?: string;
      status?: TsnEpochChallenge["status"];
    },
  ) {
    return this.client.post<typeof challenge, TsnEpochChallenge>("/epoch-challenges", challenge);
  }

  listOpenEpochChallenges(limit = 20) {
    return this.client.get<TsnEpochChallenge[]>(`/epoch-challenges?status=open&limit=${limit}`);
  }

  updateEpochChallengeStatus(
    id: string,
    status: TsnEpochChallenge["status"],
    patch: Partial<TsnEpochChallenge> = {},
  ) {
    return this.client.patch<Partial<TsnEpochChallenge> & { status: TsnEpochChallenge["status"] }, TsnEpochChallenge>(
      `/epoch-challenges/${encodeURIComponent(id)}/status`,
      { ...patch, status },
    );
  }

  listTinVerificationWork(limit = 50) {
    return this.client.get<TsnTinOperationRecord[]>(`/tin-operations/verification-work?limit=${limit}`);
  }

  listTinFeeWork(operatorPubkey: string, limit = 50) {
    return this.client.get<TsnTinOperationRecord[]>(
      `/tin-operations/fee-work?operator_pubkey=${encodeURIComponent(operatorPubkey)}&limit=${limit}`,
    );
  }

  listTinRegistryWork(operatorPubkey: string, limit = 50) {
    return this.client.get<TsnTinOperationRecord[]>(
      `/tin-operations/registry-work?operator_pubkey=${encodeURIComponent(operatorPubkey)}&limit=${limit}`,
    );
  }

  markTinOperationVerified(id: string, crankerPubkey: string) {
    return this.client.post<{ crankerPubkey: string }, TsnTinOperationRecord>(
      `/tin-operations/${encodeURIComponent(id)}/verified`,
      { crankerPubkey },
    );
  }

  markTinOperationFeeCommitted(id: string, crankerPubkey: string, feeCommitmentTx: string | null = null) {
    return this.client.post<{ crankerPubkey: string; feeCommitmentTx: string | null }, TsnTinOperationRecord>(
      `/tin-operations/${encodeURIComponent(id)}/fee-committed`,
      { crankerPubkey, feeCommitmentTx },
    );
  }

  markTinOperationSubmitted(id: string, crankerPubkey: string, txSignature: string) {
    return this.client.post<{ crankerPubkey: string; txSignature: string }, TsnTinOperationRecord>(
      `/tin-operations/${encodeURIComponent(id)}/submitted`,
      { crankerPubkey, txSignature },
    );
  }

  markTinOperationFinalized(id: string, txSignature: string | null = null) {
    return this.client.post<{ txSignature: string | null }, TsnTinOperationRecord>(
      `/tin-operations/${encodeURIComponent(id)}/finalized`,
      { txSignature },
    );
  }

  markTinOperationFailed(id: string, reason: string) {
    return this.client.post<{ failureReason: string }, TsnTinOperationRecord>(
      `/tin-operations/${encodeURIComponent(id)}/failed`,
      { failureReason: reason },
    );
  }


  recordPruLifecycleMutation(intentId: string, mutation: PruLifecycleMutation) {
    return this.client.post<PruLifecycleMutation, TsnMempoolIntent>(
      `/intents/${encodeURIComponent(intentId)}/pru-lifecycle`,
      mutation,
    );
  }
}
