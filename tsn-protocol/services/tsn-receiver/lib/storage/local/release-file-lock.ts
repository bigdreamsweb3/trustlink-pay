import type { StorageContext } from "./types";
/** Token ownership prevents a finishing worker from deleting another worker's lock. */
export async function releaseFileLock(context: StorageContext, handle: Awaited<ReturnType<StorageContext["fs"]["open"]>>, token: string): Promise<void> {
  await handle.close();
  try {
    const owner = JSON.parse(await context.fs.readFile(context.lockFile, "utf8"));
    if (owner.token === token) await context.fs.unlink(context.lockFile);
  } catch {}
}
