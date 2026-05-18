import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  CreateIntentRequest,
  RequestClaimRequest,
  TsnClaimRequestStatus,
  TsnIntentStatus,
  TsnMempoolClaimRequest,
  TsnMempoolIntent,
  TsnWorkItem,
  ProofOfPaymentRequest,
} from "./contracts";
import { TsnHttpClient } from "./client";

export interface TsnMempool {
  postIntent(request: CreateIntentRequest): Promise<TsnMempoolIntent>;
  postClaimRequest(request: RequestClaimRequest): Promise<TsnMempoolClaimRequest>;
  listPendingWork(limit?: number): Promise<TsnWorkItem[]>;
  updateIntentStatus(id: string, status: TsnIntentStatus, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent | null>;
  updateClaimRequestStatus(
    id: string,
    status: TsnClaimRequestStatus,
    patch?: Partial<TsnMempoolClaimRequest>,
  ): Promise<TsnMempoolClaimRequest | null>;
  postProof?(request: ProofOfPaymentRequest): Promise<ProofOfPaymentRequest>;
}

type Snapshot = {
  intents: TsnMempoolIntent[];
  claimRequests: TsnMempoolClaimRequest[];
};

function now() {
  return new Date().toISOString();
}

async function readSnapshot(path: string): Promise<Snapshot> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { intents: [], claimRequests: [] };
    }
    throw error;
  }
}

async function writeSnapshot(path: string, snapshot: Snapshot) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
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
    const intent: TsnMempoolIntent = {
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

  async listPendingWork(limit = 50): Promise<TsnWorkItem[]> {
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

  listPendingWork(limit = 50): Promise<TsnWorkItem[]> {
    return this.client.listPendingWork<TsnWorkItem[]>(limit);
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
