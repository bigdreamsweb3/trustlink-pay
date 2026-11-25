import type { RelayDependencies, RelayJob } from "./types";

/** Bound retention and release expired admission even while Nodes are offline; never retry an operation. */
export async function cleanupRelayJobs(dependencies: Pick<RelayDependencies, "db" | "jobs" | "activity" | "clock">): Promise<void> {
  const now = dependencies.clock.now();
  const acquired = await dependencies.db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(dependencies.activity);
    const state = snapshot.exists ? snapshot.data() : {};
    if (Date.parse(state.nextCleanupAt ?? "") > now) return false;
    transaction.set(dependencies.activity, { ...state, nextCleanupAt: new dependencies.clock(now + 60000).toISOString() });
    return true;
  });
  if (!acquired) return;
  const active = await Promise.all(["PENDING", "LEASED"].map(status => dependencies.jobs.where("status", "==", status).limit(400).get()));
  for (const candidate of active.flatMap(page => page.docs)) {
    if (Date.parse(candidate.get("expiresAt")) > now) continue;
    await dependencies.db.runTransaction(async (transaction: any) => {
      const snapshot = await transaction.get(candidate.ref);
      const activity = await transaction.get(dependencies.activity);
      const job = snapshot.exists ? snapshot.data() as RelayJob : null;
      if (!job || !["PENDING", "LEASED"].includes(job.status) || Date.parse(job.expiresAt) > dependencies.clock.now()) return;
      const state = activity.exists ? activity.data() : {};
      transaction.update(candidate.ref, { status: "EXPIRED", lease: null });
      transaction.set(dependencies.activity, { ...state, active: { ...state.active, [job.lane]: Math.max(0, Number(state.active?.[job.lane] ?? 0) - 1) } });
    });
  }
  const expired = await dependencies.jobs.where("retainUntil", "<", new dependencies.clock(now).toISOString()).limit(32).get();
  for (const candidate of expired.docs) {
    await dependencies.db.runTransaction(async (transaction: any) => {
      const snapshot = await transaction.get(candidate.ref);
      if (snapshot.exists && ["COMPLETED", "EXPIRED"].includes(snapshot.get("status"))
          && Date.parse(snapshot.get("retainUntil")) <= dependencies.clock.now()) transaction.delete(candidate.ref);
    });
  }
}
