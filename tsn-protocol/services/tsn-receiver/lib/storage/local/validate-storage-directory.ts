import type { StorageContext } from "./types";
/** A pre-existing companion directory cannot redirect sensitive state through a link. */
export async function validateStorageDirectory(context: StorageContext): Promise<void> {
  try {
    const stat = await context.fs.lstat(context.directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("TSN_RECEIVER_LOCAL_RECORD_PATH_INVALID");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
