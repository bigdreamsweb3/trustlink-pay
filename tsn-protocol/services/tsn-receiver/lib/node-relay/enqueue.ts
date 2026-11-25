import { createHash, randomUUID } from "node:crypto";
import { validateRelayRequest } from "./validate-request";
import { relayRequestHash } from "./request-hash";
import { cleanupRelayJobs } from "./cleanup";
import type { RelayDependencies, RelayJob, RelayRequest } from "./types";

/** Store an encrypted request atomically with its wake revision; identical fenced retries reuse the same job. */
export async function enqueueRelayRequest(dependencies: RelayDependencies, request: RelayRequest, retryId?: string): Promise<RelayJob> {
  validateRelayRequest(request);
  await cleanupRelayJobs(dependencies);
  const native = request.path.startsWith("/internal/");
  let scope: Record<string, unknown> | null = null;
  let expiresAt = new dependencies.clock(dependencies.clock.now() + 120000).toISOString();
  if (native) {
    const body = JSON.parse(request.body ?? "{}");
    const work = await dependencies.workCollection.doc(String(body.workId ?? "")).get();
    const lease = work.exists ? work.get("crankerLease") : null;
    if (!work.exists) throw new Error("NODE_RELAY_WORK_NOT_FOUND");
    if (work.get("status") !== "CRANKER_LEASED" || !lease || lease.owner !== body.crankerPubkey
        || Date.parse(lease.expiresAt) <= dependencies.clock.now()) throw new Error("NODE_RELAY_WORK_LEASE_INVALID");
    scope = { workId: work.id, stateVersion: work.get("stateVersion"), leaseId: lease.leaseId, leaseVersion: lease.version, expiresAt: lease.expiresAt, operator: lease.owner };
    expiresAt = lease.expiresAt;
  }
  const requestHash = relayRequestHash(request);
  if (retryId !== undefined && !/^[0-9a-f]{64}$/.test(retryId)) throw new Error("NODE_RELAY_RETRY_ID_INVALID");
  const id = retryId ?? createHash("sha256").update(native ? requestHash + JSON.stringify(scope) : randomUUID()).digest("hex");
  const now = new dependencies.clock().toISOString();
  const lane = native ? "SIGNING" : /^\/network\/(funding\/(?:readiness|complete)|recent-blockhash)$/.test(request.path) ? "FUNDING" : "PUBLIC";
  const job: RelayJob = { id, requestHash, lane, status: "PENDING", version: 1, createdAt: now, expiresAt,
    retainUntil: new dependencies.clock(dependencies.clock.now() + 86400000).toISOString(), request: dependencies.encrypt(request), scope };
  return dependencies.db.runTransaction(async (transaction: any) => {
    const reference = dependencies.jobs.doc(id);
    const existing = await transaction.get(reference);
    const activity = await transaction.get(dependencies.activity);
    if (existing.exists) {
      const current = existing.data() as RelayJob;
      if (current.requestHash !== requestHash || JSON.stringify(current.scope) !== JSON.stringify(scope)) throw new Error("NODE_RELAY_REQUEST_CONFLICT");
      return current;
    }
    const state = activity.exists ? activity.data() : {};
    const revision = Number(state.revision ?? 0);
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) throw new Error("NODE_RELAY_REVISION_INVALID");
    const active = Number(state.active?.[lane] ?? 0);
    if (!Number.isInteger(active) || active < 0 || active >= 128) throw new Error("NODE_RELAY_QUEUE_FULL");
    transaction.set(reference, job);
    transaction.set(dependencies.activity, { ...state, epoch: state.epoch ?? randomUUID(), revision: revision + 1, updatedAt: now,
      active: { ...state.active, [lane]: active + 1 } });
    return job;
  });
}
