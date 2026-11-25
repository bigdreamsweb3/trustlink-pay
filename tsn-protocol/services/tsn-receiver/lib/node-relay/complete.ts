import { verifyRelayReply } from "./verify-reply";
import type { RelayDependencies, RelayJob, RelayReply } from "./types";

/** A pinned Node reply is committed once under the current claim; exact lost-response repeats are idempotent. */
export async function completeRelayJob(dependencies: RelayDependencies, id: string, owner: string, version: number, requestHash: string, reply: RelayReply) {
  if (!/^[0-9a-f]{64}$/.test(id) || !/^[A-Za-z0-9_-]{1,64}$/.test(owner)) throw new Error("NODE_RELAY_CLAIM_INVALID");
  return dependencies.db.runTransaction(async (transaction: any) => {
    const reference = dependencies.jobs.doc(id);
    const snapshot = await transaction.get(reference);
    const activity = await transaction.get(dependencies.activity);
    const job = snapshot.exists ? snapshot.data() as RelayJob : null;
    if (!job || job.version !== version || job.requestHash !== requestHash || job.lease?.owner !== owner) throw new Error("NODE_RELAY_LEASE_INVALID");
    verifyRelayReply(dependencies, job, owner, reply);
    if (job.status === "COMPLETED") {
      const saved = dependencies.decrypt(job.response!);
      if (saved.status !== reply.status || saved.body !== reply.body || saved.contentType !== reply.contentType) throw new Error("NODE_RELAY_REPLY_CONFLICT");
      return { id, status: "COMPLETED", version };
    }
    if (job.status !== "LEASED" || Date.parse(job.lease.expiresAt) <= dependencies.clock.now()
        || Date.parse(job.expiresAt) <= dependencies.clock.now()) throw new Error("NODE_RELAY_LEASE_INVALID");
    if (job.scope) {
      const work = await transaction.get(dependencies.workCollection.doc(String(job.scope.workId)));
      const lease = work.exists ? work.get("crankerLease") : null;
      if (!work.exists || work.get("status") !== "CRANKER_LEASED" || work.get("stateVersion") !== job.scope.stateVersion
          || lease?.owner !== job.scope.operator || lease?.leaseId !== job.scope.leaseId || lease?.version !== job.scope.leaseVersion
          || lease?.expiresAt !== job.scope.expiresAt || Date.parse(lease.expiresAt) <= dependencies.clock.now()) throw new Error("NODE_RELAY_WORK_LEASE_INVALID");
    }
    const state = activity.exists ? activity.data() : {};
    transaction.update(reference, { status: "COMPLETED", response: dependencies.encrypt(reply), responseStatus: reply.status });
    transaction.set(dependencies.activity, { ...state, active: { ...state.active, [job.lane]: Math.max(0, Number(state.active?.[job.lane] ?? 0) - 1) } });
    return { id, status: "COMPLETED", version };
  });
}
