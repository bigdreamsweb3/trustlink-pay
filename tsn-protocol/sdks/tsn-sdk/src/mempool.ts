import type {
  CreateIntentRequest,
  TsnIntentStatus,
  TsnMempoolIntent,
  PublicTsnMempoolIntent,
  TsnIntentWorkItem,
  TsnEpochChallenge,
} from "./contracts.js";
import { TsnHttpClient } from "./client.js";

export interface TsnMempool {
  postIntent(request: CreateIntentRequest): Promise<PublicTsnMempoolIntent>;
  listIntents(params?: { status?: TsnIntentStatus }): Promise<PublicTsnMempoolIntent[]>;
  listPendingIntentWork(limit?: number): Promise<TsnIntentWorkItem[]>;
  updateIntentStatus(id: string, status: TsnIntentStatus, patch?: Partial<TsnMempoolIntent>): Promise<TsnMempoolIntent>;
  publishEpochChallenge(challenge: Omit<TsnEpochChallenge, "id" | "status" | "postedAt" | "updatedAt"> & { id?: string; status?: TsnEpochChallenge["status"] }): Promise<TsnEpochChallenge>;
  listOpenEpochChallenges(limit?: number): Promise<TsnEpochChallenge[]>;
  updateEpochChallengeStatus(id: string, status: TsnEpochChallenge["status"], patch?: Partial<TsnEpochChallenge>): Promise<TsnEpochChallenge>;
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

  postIntent(request: CreateIntentRequest): Promise<PublicTsnMempoolIntent> {
    return this.client.postIntent<CreateIntentRequest, PublicTsnMempoolIntent>(request);
  }

  listIntents(params: { status?: TsnIntentStatus } = {}): Promise<PublicTsnMempoolIntent[]> {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    const query = search.toString();
    return this.client.get<PublicTsnMempoolIntent[]>(`/intents${query ? `?${query}` : ""}`);
  }


  listPendingIntentWork(limit = 50): Promise<TsnIntentWorkItem[]> {
    return this.client.listPendingIntentWork<TsnIntentWorkItem[]>(limit);
  }

  updateIntentStatus(id: string, status: TsnIntentStatus, patch: Partial<TsnMempoolIntent> = {}): Promise<TsnMempoolIntent> {
    return this.client.updateIntentStatus<Partial<TsnMempoolIntent> & { status: TsnIntentStatus }, TsnMempoolIntent>(id, {
      ...patch,
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
  ): Promise<TsnEpochChallenge> {
    return this.client.patch<Partial<TsnEpochChallenge> & { status: TsnEpochChallenge["status"] }, TsnEpochChallenge>(
      `/epoch-challenges/${encodeURIComponent(id)}/status`,
      { ...patch, status },
    );
  }

}
