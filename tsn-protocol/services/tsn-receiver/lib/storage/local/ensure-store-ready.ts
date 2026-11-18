import { initializeStore } from "./initialize-store";
import { initializationFailed } from "./initialization-failed";
import { assertLockNotReentrant } from "./assert-lock-not-reentrant";
import type { StorageContext } from "./types";
/** Imports never touch disk; initialization and verification compaction start only on an actual local operation. */
export async function ensureStoreReady(context: StorageContext): Promise<void> {
  assertLockNotReentrant(context);
  if (!context.initialized) {
    context.initialized = true;
    context.ready = initializeStore(context).catch(initializationFailed);
  }
  await context.ready;
}
