import path from "node:path";
import { resolveRecordPath } from "./resolve-record-path";
import { validateStorageDirectory } from "./validate-storage-directory";
import type { StorageContext } from "./types";
/** Resolve only validated paths whose existing descendants contain no symbolic links. */
export async function validateRecordLocation(context: StorageContext, relative: string, validatedDirectories?: Set<string>): Promise<string> {
  const resolved = resolveRecordPath(context, relative);
  if (!validatedDirectories?.has(context.directory)) {
    await validateStorageDirectory(context);
    validatedDirectories?.add(context.directory);
  }
  const parts = relative.split("/");
  for (let count = 1; count <= parts.length; count += 1) {
    const current = path.resolve(context.directory, ...parts.slice(0, count));
    if (count < parts.length && validatedDirectories?.has(current)) continue;
    try {
      const stat = await context.fs.lstat(current);
      if (stat.isSymbolicLink() || (count < parts.length && !stat.isDirectory())) throw new Error("TSN_RECEIVER_LOCAL_RECORD_PATH_INVALID");
      if (count < parts.length) validatedDirectories?.add(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  return resolved;
}
