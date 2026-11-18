import { withFileLock } from "./with-file-lock";
import { loadSnapshot } from "./load-snapshot";
import { ensureStoreReady } from "./ensure-store-ready";
import type { Database, StorageContext } from "./types";
export async function readStore(context: StorageContext): Promise<Database> {
  await ensureStoreReady(context);
  const loaded = await withFileLock(context, loadSnapshot.bind(null, context));
  return loaded.data;
}
