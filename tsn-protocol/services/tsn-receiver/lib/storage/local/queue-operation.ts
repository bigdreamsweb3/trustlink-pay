import { settleQueue } from "./settle-queue";
import { getLockScheduler } from "./get-lock-scheduler";
import { lockQueueKey } from "./lock-queue-key";
import { initializeLockTicket } from "./initialize-lock-ticket";
import { runQueuedLock } from "./run-queued-lock";
import { clearLockQueue } from "./clear-lock-queue";
import { assertLockNotReentrant } from "./assert-lock-not-reentrant";
import type { LockQueueTicket, StorageContext } from "./types";
/** Shared across bundle contexts; canceled queued work never reaches the filesystem or user callback. */
export function queueOperation<T>(context: StorageContext, operation: (startedAt: number) => Promise<T>): Promise<T> {
  const scheduler = getLockScheduler();
  const key = lockQueueKey(context.lockFile);
  const parents = scheduler.leases.getStore() ?? [];
  try { assertLockNotReentrant(context); }
  catch (error) { return Promise.reject(error); }
  const ticket: LockQueueTicket<T> = { startedAt: Date.now(), started: false, cancelled: false };
  const result = new Promise<T>((initializeLockTicket<T>).bind(null, ticket));
  const run = (scheduler.tails.get(key) ?? Promise.resolve()).then((runQueuedLock<T>).bind(null, scheduler, key, parents, ticket, operation));
  const tail = run.then(settleQueue, settleQueue);
  scheduler.tails.set(key, tail);
  void tail.then(clearLockQueue.bind(null, scheduler, key, tail));
  return result;
}
