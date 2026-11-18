import { recoverJournal } from "./recover-journal";
import { loadManifest } from "./load-manifest";
import { readSnapshotRecord } from "./read-snapshot-record";
import type { Row, StorageContext } from "./types";
/** Under the exclusive lock: recover, validate the complete index, then load only the requested row. */
export async function loadDocument(context: StorageContext, collection: string, id: string): Promise<Row | null> {
  await recoverJournal(context);
  const manifest = await loadManifest(context);
  const relative = manifest.collections[collection]?.[id];
  if (relative === undefined) return null;
  const record = await readSnapshotRecord(context, new Set<string>(), { collection, id, relative });
  return record.row;
}
