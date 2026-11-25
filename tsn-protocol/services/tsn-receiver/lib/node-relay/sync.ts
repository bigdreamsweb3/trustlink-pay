import type { RelayDependencies } from "./types";

/** A small authenticated cursor notification replaces inbound wakes; no work payload is replicated here. */
export async function syncLocalNode(dependencies: Pick<RelayDependencies, "activity">, epoch: string, cursor: number) {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || epoch.length > 64) throw new Error("NODE_RELAY_CURSOR_INVALID");
  const view = (snapshot: any) => {
    const data = snapshot.exists ? snapshot.data() : {};
    const revision = Number(data.revision ?? 0);
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("NODE_RELAY_REVISION_INVALID");
    return { epoch: String(data.epoch ?? "empty"), cursor: revision, retryAfterMs: 0 };
  };
  const current = view(await dependencies.activity.get());
  if (current.epoch !== epoch || current.cursor !== cursor) return current;
  if (typeof dependencies.activity.onSnapshot !== "function") return { ...current, retryAfterMs: 2000 };
  return new Promise<typeof current>((resolve, reject) => {
    let unsubscribe = () => {}, settled = false;
    const timer = setTimeout(() => { settled = true; unsubscribe(); resolve(current); }, 15000);
    unsubscribe = dependencies.activity.onSnapshot((snapshot: any) => {
      try {
        const latest = view(snapshot);
        if (latest.epoch !== epoch || latest.cursor !== cursor) { settled = true; clearTimeout(timer); unsubscribe(); resolve(latest); }
      } catch (error) { settled = true; clearTimeout(timer); unsubscribe(); reject(error); }
    }, (error: unknown) => { settled = true; clearTimeout(timer); unsubscribe(); reject(error); });
    if (settled) unsubscribe();
  });
}
