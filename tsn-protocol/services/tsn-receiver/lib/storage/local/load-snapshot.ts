import { recoverJournal } from "./recover-journal";
import { loadManifest } from "./load-manifest";
import { readSnapshotRecord } from "./read-snapshot-record";
import { completeRecordBatch } from "./complete-record-batch";
import type { Database, LoadedStore, RecordLocation, StorageContext } from "./types";
/** Under the exclusive lock only: recover, validate manifest, then read its ordered records. */
export async function loadSnapshot(context: StorageContext): Promise<LoadedStore> {
  await recoverJournal(context);
  const manifest = await loadManifest(context);
  const data: Database = Object.create(null);
  const serialized = new Map<string,string>();
  const validatedDirectories = new Set<string>();
  const records: RecordLocation[] = [];
  for (const [collection, paths] of Object.entries(manifest.collections)) {
    data[collection] = Object.create(null);
    for (const [id, relative] of Object.entries(paths)) records.push({ collection, id, relative });
  }
  const readRecord = readSnapshotRecord.bind(null, context, validatedDirectories);
  for (let offset = 0; offset < records.length; offset += 16) {
    const loaded = await completeRecordBatch(records.slice(offset, offset + 16).map(readRecord));
    for (const record of loaded) {
      data[record.collection][record.id] = record.row;
      serialized.set(record.relative, record.serialized);
    }
  }
  return { data, manifest, serialized };
}
