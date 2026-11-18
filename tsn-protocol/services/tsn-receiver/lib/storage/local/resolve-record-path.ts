import path from "node:path";
import type { StorageContext } from "./types";
/** Reject manifest/journal traversal, platform aliases and absolute paths before IO. */
export function resolveRecordPath(context: StorageContext, relative: string): string {
  if (typeof relative !== "string" || relative.includes("\\") || !/^(?:epochs\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+|metadata\/[a-f0-9]{64})\/[a-f0-9]{64}\.json$/.test(relative)) {
    throw new Error("TSN_RECEIVER_LOCAL_RECORD_PATH_INVALID");
  }
  const resolved = path.resolve(context.directory, ...relative.split("/"));
  if (!resolved.startsWith(path.resolve(context.directory) + path.sep)) throw new Error("TSN_RECEIVER_LOCAL_RECORD_PATH_INVALID");
  return resolved;
}
