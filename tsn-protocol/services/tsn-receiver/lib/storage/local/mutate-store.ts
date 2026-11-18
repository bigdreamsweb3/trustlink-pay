import { withFileLock } from "./with-file-lock";
import { performMutation } from "./perform-mutation";
import { ensureStoreReady } from "./ensure-store-ready";
import type { Database, StorageContext } from "./types";
export async function mutateStore<T>(context: StorageContext, operation: (data: Database) => Promise<T> | T): Promise<T> {
  await ensureStoreReady(context);
  return withFileLock(context, performMutation.bind(null, context, operation)) as Promise<T>;
}
