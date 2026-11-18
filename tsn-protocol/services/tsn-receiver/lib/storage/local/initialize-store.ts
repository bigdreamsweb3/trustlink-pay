import { withFileLock } from "./with-file-lock";
import { initializeLockedStore } from "./initialize-locked-store";
import type { StorageContext } from "./types";
export async function initializeStore(context: StorageContext): Promise<void> {
  await withFileLock(context, initializeLockedStore.bind(null, context));
}
