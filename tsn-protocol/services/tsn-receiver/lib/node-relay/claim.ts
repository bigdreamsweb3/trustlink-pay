import type { RelayDependencies, RelayJob, RelayLane } from "./types";

/** Atomically lease one bounded request; work-signing jobs retain their original Cranker generation. */
export async function claimRelayJob(dependencies: RelayDependencies, owner: string, lane: RelayLane) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(owner) || !["FUNDING", "SIGNING", "PUBLIC"].includes(lane)) throw new Error("NODE_RELAY_CLAIM_INVALID");
  const pages = await Promise.all(["PENDING", "LEASED"].map(status => dependencies.jobs.where("status", "==", status).limit(400).get()));
  const ordered = pages.flatMap(page => page.docs).filter((doc: any) => doc.get("lane") === lane)
    .sort((a: any, b: any) => String(a.get("createdAt")).localeCompare(String(b.get("createdAt"))));
  for (const candidate of ordered) {
    const claimed = await dependencies.db.runTransaction(async (transaction: any) => {
      const snapshot = await transaction.get(candidate.ref);
      const activity = await transaction.get(dependencies.activity);
      if (!snapshot.exists) return null;
      const job = snapshot.data() as RelayJob;
      if (job.lane !== lane || !["PENDING", "LEASED"].includes(job.status)) return null;
      if (job.status === "LEASED" && Date.parse(job.lease?.expiresAt ?? "") > dependencies.clock.now()) return null;
      let valid = Date.parse(job.expiresAt) > dependencies.clock.now();
      if (job.scope) {
        const work = await transaction.get(dependencies.workCollection.doc(String(job.scope.workId)));
        const lease = work.exists ? work.get("crankerLease") : null;
        valid = valid && work.exists && work.get("status") === "CRANKER_LEASED" && work.get("stateVersion") === job.scope.stateVersion
          && lease?.owner === job.scope.operator && lease?.leaseId === job.scope.leaseId && lease?.version === job.scope.leaseVersion
          && lease?.expiresAt === job.scope.expiresAt && Date.parse(lease.expiresAt) > dependencies.clock.now();
      }
      if (!valid) {
        const state = activity.exists ? activity.data() : {};
        transaction.update(candidate.ref, { status: "EXPIRED", lease: null });
        transaction.set(dependencies.activity, { ...state, active: { ...state.active, [lane]: Math.max(0, Number(state.active?.[lane] ?? 0) - 1) } });
        return null;
      }
      const version = job.version + 1;
      const lease = { owner, version, expiresAt: new dependencies.clock(Math.min(dependencies.clock.now() + 60000, Date.parse(job.expiresAt))).toISOString() };
      transaction.update(candidate.ref, { status: "LEASED", version, lease });
      return { ...job, status: "LEASED", version, lease } as RelayJob;
    });
    if (claimed) return { ...claimed, request: dependencies.decrypt(claimed.request), response: undefined };
  }
  return null;
}
