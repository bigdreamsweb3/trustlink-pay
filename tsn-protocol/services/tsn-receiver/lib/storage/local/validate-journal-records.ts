import { validateRecordLocation } from "./validate-record-location";
import { validateJournalRecord } from "./validate-journal-record";
import { completeRecordBatch } from "./complete-record-batch";
import type { Journal, RecordLocation, Row, StorageContext } from "./types";
/** Preflight all target records before applying a pending transaction or replacing its manifest. */
export async function validateJournalRecords(context: StorageContext, journal: Journal): Promise<void> {
  const writes = new Map<string, Row>();
  const validatedDirectories = new Set<string>();
  const entries: RecordLocation[] = [];
  for (const write of journal.writes) writes.set(write.path, write.row);
  for (const [collection, records] of Object.entries(journal.manifest.collections)) {
    for (const [id, relative] of Object.entries(records)) entries.push({ collection, id, relative });
  }
  const validateRecord = validateJournalRecord.bind(null, context, writes, validatedDirectories);
  for (let offset = 0; offset < entries.length; offset += 16) {
    await completeRecordBatch(entries.slice(offset, offset + 16).map(validateRecord));
  }
  for (const relative of journal.deletes) await validateRecordLocation(context, relative, validatedDirectories);
}
