import { getLockScheduler } from "./get-lock-scheduler";
import { lockQueueKey } from "./lock-queue-key";
import type { StorageContext } from "./types";
/** Reject self-waits before either initialization or native acquisition is queued. */
export function assertLockNotReentrant(context: StorageContext): void {
  const key = lockQueueKey(context.lockFile);
  for (const lease of getLockScheduler().leases.getStore() ?? []) {
    if (lease.active && lease.key === key) throw new Error("TSN_RECEIVER_LOCAL_STORE_BUSY");
  }
}
