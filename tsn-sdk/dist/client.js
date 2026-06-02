export class TsnHttpClient {
    baseUrl;
    fetchImpl;
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
        const fetchImpl = options.fetchImpl ?? globalThis.fetch;
        this.fetchImpl = fetchImpl.bind(globalThis);
    }
    async post(path, body) {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`TSN request failed (${response.status}): ${await response.text()}`);
        }
        return (await response.json());
    }
    async get(path) {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`);
        if (!response.ok) {
            throw new Error(`TSN request failed (${response.status}): ${await response.text()}`);
        }
        return (await response.json());
    }
    async patch(path, body) {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
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
}
