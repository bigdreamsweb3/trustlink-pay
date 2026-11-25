import type { RelayDependencies, RelayJob } from "./types";

/** Renew only the same active relay generation; never extend the original request/Cranker deadline. */
export async function renewRelayJob(dependencies: Pick<RelayDependencies, "db" | "jobs" | "clock">, id: string, owner: string, version: number, requestHash: string) {
  if (!/^[0-9a-f]{64}$/.test(id) || !/^[A-Za-z0-9_-]{1,64}$/.test(owner)) throw new Error("NODE_RELAY_CLAIM_INVALID");
  return dependencies.db.runTransaction(async (transaction: any) => {
    const reference = dependencies.jobs.doc(id);
    const snapshot = await transaction.get(reference);
    const job = snapshot.exists ? snapshot.data() as RelayJob : null;
    if (!job || job.status !== "LEASED" || job.version !== version || job.requestHash !== requestHash
        || job.lease?.owner !== owner || Date.parse(job.lease.expiresAt) <= dependencies.clock.now()
        || Date.parse(job.expiresAt) <= dependencies.clock.now()) throw new Error("NODE_RELAY_LEASE_INVALID");
    const lease = { ...job.lease, expiresAt: new dependencies.clock(Math.min(dependencies.clock.now() + 60000, Date.parse(job.expiresAt))).toISOString() };
    transaction.update(reference, { lease });
    return { id, version, lease };
  });
}
