import type { LockScheduler } from "./types";
/** A finishing entry may remove only its own tail, never a successor's queue. */
export function clearLockQueue(scheduler: LockScheduler, key: string, tail: Promise<void>): void {
  if (scheduler.tails.get(key) === tail) scheduler.tails.delete(key);
}
