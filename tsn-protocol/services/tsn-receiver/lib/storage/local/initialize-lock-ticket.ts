import { expireLockTicket } from "./expire-lock-ticket";
import type { LockQueueTicket } from "./types";
/** Capture the caller promise and a bounded wait; the deadline is canceled when native acquisition begins. */
export function initializeLockTicket<T>(ticket: LockQueueTicket<T>, resolve: (value: T | PromiseLike<T>) => void, reject: (error: unknown) => void): void {
  ticket.resolve = resolve;
  ticket.reject = reject;
  ticket.timer = setTimeout((expireLockTicket<T>).bind(null, ticket), 10_000);
}
