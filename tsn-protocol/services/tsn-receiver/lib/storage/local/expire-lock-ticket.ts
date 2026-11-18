import type { LockQueueTicket } from "./types";
/** A failed wait is a cancellation, so a queued mutation cannot execute later. */
export function expireLockTicket<T>(ticket: LockQueueTicket<T>): void {
  if (ticket.started || ticket.cancelled) return;
  ticket.cancelled = true;
  if (ticket.timer) clearTimeout(ticket.timer);
  ticket.reject!(new Error("TSN_RECEIVER_LOCAL_STORE_BUSY"));
}
