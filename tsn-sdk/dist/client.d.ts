export type TsnHttpClientOptions = {
    baseUrl: string;
    fetchImpl?: typeof fetch;
    apiKey?: string | null;
};
export declare class TsnHttpClient {
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly apiKey?;
    constructor(options: TsnHttpClientOptions);
    private headers;
    post<TRequest, TResponse>(path: string, body: TRequest): Promise<TResponse>;
    get<TResponse>(path: string): Promise<TResponse>;
    patch<TRequest, TResponse>(path: string, body: TRequest): Promise<TResponse>;
    postIntent<TRequest, TResponse>(body: TRequest): Promise<TResponse>;
    postClaimRequest<TRequest, TResponse>(body: TRequest): Promise<TResponse>;
    listPendingWork<TResponse>(limit?: number): Promise<TResponse>;
    listPendingIntentWork<TResponse>(limit?: number): Promise<TResponse>;
    updateIntentStatus<TRequest, TResponse>(id: string, body: TRequest): Promise<TResponse>;
    updateClaimRequestStatus<TRequest, TResponse>(id: string, body: TRequest): Promise<TResponse>;
    postProof<TRequest, TResponse>(body: TRequest): Promise<TResponse>;
    listRecoveryWork<TResponse>(operatorPubkey: string, limit?: number): Promise<TResponse>;
    claimRecoveryLease<TRequest, TResponse>(id: string, body: TRequest): Promise<TResponse>;
    updateRecoveryStatus<TRequest, TResponse>(id: string, body: TRequest): Promise<TResponse>;
}
//# sourceMappingURL=client.d.ts.map