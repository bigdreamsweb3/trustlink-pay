import { isObject } from "./is-object";
import { resolveRecordPath } from "./resolve-record-path";
import type { Manifest, StorageContext } from "./types";
export function validateManifest(context: StorageContext, value: unknown): Manifest {
  if (!isObject(value) || value.format !== "TSN_RECEIVER_FILE_STORE" || value.version !== 1 || !isObject(value.collections)) {
    throw new Error("TSN_RECEIVER_LOCAL_MANIFEST_INVALID");
  }
  const seen = new Set<string>();
  const collections: Manifest["collections"] = Object.create(null);
  for (const [collection, entries] of Object.entries(value.collections)) {
    if (!isObject(entries)) throw new Error("TSN_RECEIVER_LOCAL_MANIFEST_INVALID");
    const records: Record<string,string> = Object.create(null);
    for (const [id, relative] of Object.entries(entries)) {
      resolveRecordPath(context, relative);
      if (seen.has(relative.toLowerCase())) throw new Error("TSN_RECEIVER_LOCAL_MANIFEST_INVALID");
      seen.add(relative.toLowerCase());
      records[id] = relative;
    }
    collections[collection] = records;
  }
  return { format: "TSN_RECEIVER_FILE_STORE", version: 1, collections };
}
