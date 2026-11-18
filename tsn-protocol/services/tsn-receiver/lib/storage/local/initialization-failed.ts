/** Preserve deferred failure reporting: the next locked operation still validates and recovers state. */
export function initializationFailed(error: unknown): void {
  console.error("[receiver] local store initialization failed; reads remain subject to locked validation", error);
}
