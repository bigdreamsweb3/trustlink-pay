import { ensureStoreReady } from "./ensure-store-ready";
import { withFileLock } from "./with-file-lock";
import { loadDocument } from "./load-document";
import type { Row, StorageContext } from "./types";
/** Retain initialization and lock ownership while reading one indexed document. */
export async function readDocument(context: StorageContext, collection: string, id: string): Promise<Row | null> {
  await ensureStoreReady(context);
  return withFileLock(context, loadDocument.bind(null, context, collection, id));
}
