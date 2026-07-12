export type TsnHttpClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  apiKey?: string | null;
};

export class TsnHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey?: string;

  constructor(options: TsnHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.fetchImpl = fetchImpl.bind(globalThis) as typeof fetch;
    this.apiKey = options.apiKey?.trim() || undefined;
  }

  private headers(includeJson = false) {
    return {
      ...(includeJson ? { "Content-Type": "application/json" } : {}),
      ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
    };
  }

  async post<TRequest, TResponse>(path: string, body: TRequest): Promise<TResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`TSN request failed (${response.status}): ${await response.text()}`);
    }

    return (await response.json()) as TResponse;
  }

  async get<TResponse>(path: string): Promise<TResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: this.headers(),
    });

    if (!response.ok) {
      throw new Error(`TSN request failed (${response.status}): ${await response.text()}`);
    }

    return (await response.json()) as TResponse;
  }

  async patch<TRequest, TResponse>(path: string, body: TRequest): Promise<TResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: this.headers(true),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`TSN request failed (${response.status}): ${await response.text()}`);
    }

    return (await response.json()) as TResponse;
  }

  postIntent<TRequest, TResponse>(body: TRequest): Promise<TResponse> {
    return this.post("/intents", body);
  }

  postClaimRequest<TRequest, TResponse>(body: TRequest): Promise<TResponse> {
    return this.post("/claim-requests", body);
  }

  listPendingWork<TResponse>(limit = 50): Promise<TResponse> {
    return this.get(`/work?limit=${limit}`);
  }

  listPendingIntentWork<TResponse>(limit = 50): Promise<TResponse> {
    return this.get(`/intent-work?limit=${limit}`);
  }

  updateIntentStatus<TRequest, TResponse>(id: string, body: TRequest): Promise<TResponse> {
    return this.patch(`/intents/${encodeURIComponent(id)}/status`, body);
  }

  updateClaimRequestStatus<TRequest, TResponse>(id: string, body: TRequest): Promise<TResponse> {
    return this.patch(`/claim-requests/${encodeURIComponent(id)}/status`, body);
  }

  postProof<TRequest, TResponse>(body: TRequest): Promise<TResponse> {
    return this.post("/proofs", body);
  }

  listRecoveryWork<TResponse>(operatorPubkey: string, limit = 20): Promise<TResponse> {
    return this.get(
      `/recovery-work?operator_pubkey=${encodeURIComponent(operatorPubkey)}&limit=${limit}`,
    );
  }

  claimRecoveryLease<TRequest, TResponse>(id: string, body: TRequest): Promise<TResponse> {
    return this.post(`/recoveries/${encodeURIComponent(id)}/lease`, body);
  }

  updateRecoveryStatus<TRequest, TResponse>(id: string, body: TRequest): Promise<TResponse> {
    return this.patch(`/recoveries/${encodeURIComponent(id)}/status`, body);
  }
}
