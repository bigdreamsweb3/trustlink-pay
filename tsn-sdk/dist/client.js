export class TsnHttpClient {
    baseUrl;
    fetchImpl;
    apiKey;
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
        const fetchImpl = options.fetchImpl ?? globalThis.fetch;
        this.fetchImpl = fetchImpl.bind(globalThis);
        this.apiKey = options.apiKey?.trim() || undefined;
    }
    headers(includeJson = false) {
        return {
            ...(includeJson ? { "Content-Type": "application/json" } : {}),
            ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
        };
    }
    async post(path, body) {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: this.headers(true),
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`TSN request failed (${response.status}): ${await response.text()}`);
        }
        return (await response.json());
    }
    async get(path) {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            headers: this.headers(),
        });
        if (!response.ok) {
            throw new Error(`TSN request failed (${response.status}): ${await response.text()}`);
        }
        return (await response.json());
    }
    async patch(path, body) {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method: "PATCH",
            headers: this.headers(true),
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`TSN request failed (${response.status}): ${await response.text()}`);
        }
        return (await response.json());
    }
    postIntent(body) {
        return this.post("/intents", body);
    }
    postClaimRequest(body) {
        return this.post("/claim-requests", body);
    }
    listPendingWork(limit = 50) {
        return this.get(`/work?limit=${limit}`);
    }
    listPendingIntentWork(limit = 50) {
        return this.get(`/intent-work?limit=${limit}`);
    }
    updateIntentStatus(id, body) {
        return this.patch(`/intents/${encodeURIComponent(id)}/status`, body);
    }
    updateClaimRequestStatus(id, body) {
        return this.patch(`/claim-requests/${encodeURIComponent(id)}/status`, body);
    }
    postProof(body) {
        return this.post("/proofs", body);
    }
    listRecoveryWork(operatorPubkey, limit = 20) {
        return this.get(`/recovery-work?operator_pubkey=${encodeURIComponent(operatorPubkey)}&limit=${limit}`);
    }
    claimRecoveryLease(id, body) {
        return this.post(`/recoveries/${encodeURIComponent(id)}/lease`, body);
    }
    updateRecoveryStatus(id, body) {
        return this.patch(`/recoveries/${encodeURIComponent(id)}/status`, body);
    }
}
