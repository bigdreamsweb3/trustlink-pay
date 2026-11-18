import { expireLockTicket } from "./expire-lock-ticket";
import type { LockLease, LockQueueTicket, LockScheduler } from "./types";
/** Execute once under inherited ownership tracking; release the scope only after the native lock finishes. */
export async function runQueuedLock<T>(scheduler: LockScheduler, key: string, parents: LockLease[], ticket: LockQueueTicket<T>, operation: (startedAt: number) => Promise<T>): Promise<void> {
  if (ticket.cancelled) return;
  if (Date.now() - ticket.startedAt >= 10_000) { expireLockTicket(ticket); return; }
  ticket.started = true;
  if (ticket.timer) clearTimeout(ticket.timer);
  const lease: LockLease = { key, active: true };
  try { ticket.resolve!(await scheduler.leases.run([...parents, lease], operation.bind(null, ticket.startedAt))); }
  catch (error) { ticket.reject!(error); }
  finally { lease.active = false; }
}
