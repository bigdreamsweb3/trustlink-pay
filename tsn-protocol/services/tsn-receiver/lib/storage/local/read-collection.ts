import { ensureStoreReady } from "./ensure-store-ready";
import { withFileLock } from "./with-file-lock";
import { loadCollection } from "./load-collection";
import type { Database, StorageContext } from "./types";
/** Retain initialization and lock ownership while reading one collection for query evaluation. */
export async function readCollection(context: StorageContext, collection: string): Promise<Database> {
  await ensureStoreReady(context);
  return withFileLock(context, loadCollection.bind(null, context, collection));
}
