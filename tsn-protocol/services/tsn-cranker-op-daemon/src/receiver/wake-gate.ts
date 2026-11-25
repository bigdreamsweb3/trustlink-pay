/** Read-only wake hints suppress idle lease writes while periodic claims recover missed hints. */
export function createCrankerWakeGate(ports: {
  readCursor: () => Promise<string>;
  clock: () => number;
  pollMs: number;
  recoveryMs?: number | ((lane: string) => number);
}) {
  const recoveryMs = ports.recoveryMs ?? 60_000;
  const lanes = new Map<string, { cursor: string | null; nextRecoveryAt: number; draining: boolean }>();
  let cachedCursor: Promise<string | null> | null = null;
  let cacheUntil = 0;

  async function readCursor(): Promise<string | null> {
    if (!cachedCursor || ports.clock() >= cacheUntil) {
      cacheUntil = ports.clock() + ports.pollMs;
      cachedCursor = ports.readCursor().catch(() => null);
    }
    return cachedCursor;
  }

  return {
    async shouldClaim(lane: string): Promise<boolean> {
      let state = lanes.get(lane);
      if (!state) {
        state = { cursor: null, nextRecoveryAt: 0, draining: false };
        lanes.set(lane, state);
      }
      if (state.draining) return true;
      const cursor = await readCursor();
      const changed = cursor !== null && cursor !== state.cursor;
      const now = ports.clock();
      if (!changed && now < state.nextRecoveryAt) return false;
      if (cursor !== null) state.cursor = cursor;
      state.nextRecoveryAt = now + (typeof recoveryMs === "function" ? recoveryMs(lane) : recoveryMs);
      return true;
    },
    receivedWork(lane: string, hasWork: boolean): void {
      const state = lanes.get(lane);
      if (state) state.draining = hasWork;
    },
  };
}
