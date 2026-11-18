import { randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { reclaimStaleLock } from "./reclaim-stale-lock";
import { releaseFileLock } from "./release-file-lock";
import type { StorageContext } from "./types";
/** Queue waiting and native acquisition share the existing ten-second budget; operation lifetime is unchanged. */
export async function runFileLockedOperation<T>(context: StorageContext, operation: () => Promise<T>, startedAt: number): Promise<T> {
  await context.fs.mkdir(path.dirname(context.lockFile), { recursive: true });
  const token = randomUUID();
  let transientOpenFailures = 0;
  let handle;
  while (!handle) {
    if (Date.now() - startedAt > 10_000) throw new Error("TSN_RECEIVER_LOCAL_STORE_BUSY");
    try { handle = await context.fs.open(context.lockFile, "wx"); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        if (transientOpenFailures === 7 || Date.now() - startedAt > 10_000) throw error;
        transientOpenFailures += 1; await delay(40 * transientOpenFailures); continue;
      }
      if (code !== "EEXIST") throw error;
      if (await reclaimStaleLock(context)) continue;
      if (Date.now() - startedAt > 10_000) throw new Error("TSN_RECEIVER_LOCAL_STORE_BUSY");
      await delay(20);
    }
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, token }), "utf8");
    await handle.sync();
    if (Date.now() - startedAt > 10_000) throw new Error("TSN_RECEIVER_LOCAL_STORE_BUSY");
    return await operation();
  } finally { await releaseFileLock(context, handle, token); }
}
