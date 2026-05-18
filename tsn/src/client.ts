export type TsnHttpClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export class TsnHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TsnHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async post<TRequest, TResponse>(path: string, body: TRequest): Promise<TResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`TSN request failed (${response.status}): ${await response.text()}`);
    }

    return (await response.json()) as TResponse;
  }

  async get<TResponse>(path: string): Promise<TResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`);

    if (!response.ok) {
      throw new Error(`TSN request failed (${response.status}): ${await response.text()}`);
    }

    return (await response.json()) as TResponse;
  }

  async patch<TRequest, TResponse>(path: string, body: TRequest): Promise<TResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
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

  updateIntentStatus<TRequest, TResponse>(id: string, body: TRequest): Promise<TResponse> {
    return this.patch(`/intents/${encodeURIComponent(id)}/status`, body);
  }

  updateClaimRequestStatus<TRequest, TResponse>(id: string, body: TRequest): Promise<TResponse> {
    return this.patch(`/claim-requests/${encodeURIComponent(id)}/status`, body);
  }

  postProof<TRequest, TResponse>(body: TRequest): Promise<TResponse> {
    return this.post("/proofs", body);
  }
}
