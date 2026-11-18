import { AsyncLocalStorage } from "node:async_hooks";
import type { LockLease, LockScheduler } from "./types";
const registryKey = Symbol.for("TSN_RECEIVER_LOCAL_LOCK_SCHEDULER_V1");
/** A storage-owned realm registry shares only scheduling state across separately bundled modules. */
export function getLockScheduler(): LockScheduler {
  const host = globalThis as typeof globalThis & { [key: symbol]: LockScheduler | undefined };
  let scheduler = host[registryKey];
  if (!scheduler) {
    scheduler = { tails: new Map(), leases: new AsyncLocalStorage<LockLease[]>() };
    host[registryKey] = scheduler;
  }
  return scheduler;
}
