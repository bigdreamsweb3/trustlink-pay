import { validateRecordLocation } from "./validate-record-location";
import { isObject } from "./is-object";
import { recordPath } from "./record-path";
import type { RecordLocation, Row, StorageContext } from "./types";
/** Preflight one resulting row, using staged data only for an exact journal write path. */
export async function validateJournalRecord(context: StorageContext, writes: Map<string, Row>, validatedDirectories: Set<string>, entry: RecordLocation): Promise<void> {
  const location = await validateRecordLocation(context, entry.relative, validatedDirectories);
  let row = writes.get(entry.relative);
  if (!writes.has(entry.relative)) row = JSON.parse(await context.fs.readFile(location, "utf8"));
  if (!isObject(row) || recordPath(context, entry.collection, entry.id, row) !== entry.relative) throw new Error("TSN_RECEIVER_LOCAL_JOURNAL_INVALID");
}
