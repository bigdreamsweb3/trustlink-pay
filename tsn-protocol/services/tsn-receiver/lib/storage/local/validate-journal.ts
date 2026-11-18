import { isObject } from "./is-object";
import { validateManifest } from "./validate-manifest";
import { resolveRecordPath } from "./resolve-record-path";
import { recordPath } from "./record-path";
import type { Journal, StorageContext } from "./types";
export function validateJournal(context: StorageContext, value: unknown): Journal {
  if (!isObject(value) || value.format !== "TSN_RECEIVER_FILE_TRANSACTION" || value.version !== 1 || !Array.isArray(value.writes) || !Array.isArray(value.deletes)) {
    throw new Error("TSN_RECEIVER_LOCAL_JOURNAL_INVALID");
  }
  const manifest = validateManifest(context, value.manifest);
  const entries = new Map<string,[string,string]>();
  for (const [collection, records] of Object.entries(manifest.collections)) {
    for (const [id, relative] of Object.entries(records)) entries.set(relative, [collection, id]);
  }
  const writes: Journal["writes"] = [];
  const seen = new Set<string>();
  for (const write of value.writes) {
    if (!isObject(write) || !isObject(write.row)) throw new Error("TSN_RECEIVER_LOCAL_JOURNAL_INVALID");
    resolveRecordPath(context, write.path);
    const entry = entries.get(write.path);
    if (!entry || seen.has(write.path) || recordPath(context, entry[0], entry[1], write.row) !== write.path) throw new Error("TSN_RECEIVER_LOCAL_JOURNAL_INVALID");
    seen.add(write.path); writes.push({ path: write.path, row: write.row });
  }
  const deletes: string[] = [];
  const removed = new Set<string>();
  for (const relative of value.deletes) {
    resolveRecordPath(context, relative);
    if (entries.has(relative) || removed.has(relative)) throw new Error("TSN_RECEIVER_LOCAL_JOURNAL_INVALID");
    removed.add(relative); deletes.push(relative);
  }
  return { format: "TSN_RECEIVER_FILE_TRANSACTION", version: 1, manifest, writes, deletes };
}
