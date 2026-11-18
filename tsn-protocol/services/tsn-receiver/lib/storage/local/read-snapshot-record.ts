import { isObject } from "./is-object";
import { validateRecordLocation } from "./validate-record-location";
import { recordPath } from "./record-path";
import type { LoadedRecord, RecordLocation, StorageContext } from "./types";
/** Read and validate one manifest entry while its owning snapshot retains the exclusive lock. */
export async function readSnapshotRecord(context: StorageContext, validatedDirectories: Set<string>, entry: RecordLocation): Promise<LoadedRecord> {
  let row;
  try { row = JSON.parse(await context.fs.readFile(await validateRecordLocation(context, entry.relative, validatedDirectories), "utf8")); }
  catch (error) { throw new Error("TSN_RECEIVER_LOCAL_RECORD_INVALID", { cause: error }); }
  if (!isObject(row) || recordPath(context, entry.collection, entry.id, row) !== entry.relative) throw new Error("TSN_RECEIVER_LOCAL_RECORD_INVALID");
  return { ...entry, row, serialized: JSON.stringify(row, null, 2) };
}
