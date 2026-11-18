import { recoverJournal } from "./recover-journal";
import { loadManifest } from "./load-manifest";
import { readSnapshotRecord } from "./read-snapshot-record";
import { completeRecordBatch } from "./complete-record-batch";
import type { Database, RecordLocation, StorageContext } from "./types";
/** Under the exclusive lock: recover, validate the complete index, then load one collection in manifest order. */
export async function loadCollection(context: StorageContext, collection: string): Promise<Database> {
  await recoverJournal(context);
  const manifest = await loadManifest(context);
  const data: Database = Object.create(null);
  const paths = manifest.collections[collection];
  if (paths === undefined) return data;
  data[collection] = Object.create(null);
  const records: RecordLocation[] = [];
  for (const [id, relative] of Object.entries(paths)) records.push({ collection, id, relative });
  const readRecord = readSnapshotRecord.bind(null, context, new Set<string>());
  for (let offset = 0; offset < records.length; offset += 16) {
    const loaded = await completeRecordBatch(records.slice(offset, offset + 16).map(readRecord));
    for (const record of loaded) data[record.collection][record.id] = record.row;
  }
  return data;
}
