import type { Metadata } from "./types";
/** Missing storage never silently becomes an empty queue. */
export function parseStoreMetadata(raw: unknown): Metadata {
  if (raw === null) throw new Error("TSN_STORE_NOT_INITIALIZED");
  if (typeof raw !== "string") throw new Error("TSN_STORE_INVALID");
  let value: Metadata;
  try { value = JSON.parse(raw); } catch { throw new Error("TSN_STORE_INVALID"); }
  if (!value || value.format !== "TSN_RECEIVER_RECORD_STORE" || value.version !== 1 || !Number.isSafeInteger(value.revision)
      || value.revision < 0 || !value.collections || typeof value.collections !== "object" || Array.isArray(value.collections)
      || Object.values(value.collections).some(index => !index || typeof index !== "object" || Array.isArray(index)
        || Object.values(index).some(key => typeof key !== "string"))) throw new Error("TSN_STORE_INVALID");
  return value;
}
