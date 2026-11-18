import { emptyManifest } from "./empty-manifest";
import { recordPath } from "./record-path";
import type { Database, Journal, LoadedStore, StorageContext } from "./types";
/** Retain ordered collection/document metadata; journal only changed rows, never a duplicate database. */
export function buildJournal(context: StorageContext, data: Database, before: LoadedStore): Journal {
  const manifest = emptyManifest();
  const writes: Journal["writes"] = [];
  const desired = new Set<string>();
  for (const [collection, rows] of Object.entries(data)) {
    const paths: Record<string,string> = Object.create(null);
    for (const [id, row] of Object.entries(rows)) {
      const relative = recordPath(context, collection, id, row);
      paths[id] = relative; desired.add(relative);
      if (before.serialized.get(relative) !== JSON.stringify(row, null, 2)) writes.push({ path: relative, row });
    }
    manifest.collections[collection] = paths;
  }
  const deletes: string[] = [];
  for (const relative of before.serialized.keys()) if (!desired.has(relative)) deletes.push(relative);
  return { format: "TSN_RECEIVER_FILE_TRANSACTION", version: 1, manifest, writes, deletes };
}
