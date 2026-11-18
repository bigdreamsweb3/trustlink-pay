import { lockOwnerAlive } from "./lock-owner-alive";
import type { StorageContext } from "./types";
/** Only reclaim an old lock with an absent/dead owner; never classify access denial as stale. */
export async function reclaimStaleLock(context: StorageContext): Promise<boolean> {
  let stat;
  try { stat = await context.fs.stat(context.lockFile); } catch { return false; }
  if (Date.now() - stat.mtimeMs <= 30_000) return false;
  let owner;
  try { owner = JSON.parse(await context.fs.readFile(context.lockFile, "utf8")); }
  catch { return false; }
  if (!owner || typeof owner.token !== "string" || lockOwnerAlive(owner.pid)) return false;
  try {
    const fresh = await context.fs.readFile(context.lockFile, "utf8");
    if (fresh !== JSON.stringify(owner)) return false;
    await context.fs.unlink(context.lockFile); return true;
  } catch { return false; }
}
