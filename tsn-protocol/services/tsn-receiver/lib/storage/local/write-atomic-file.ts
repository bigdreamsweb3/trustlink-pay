import { randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { StorageContext } from "./types";
/** Flush a temporary sibling then atomically rename; preserve Windows transient retry behavior. */
export async function writeAtomicFile(context: StorageContext, target: string, contents: string): Promise<void> {
  await context.fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await context.fs.open(temporary, "wx");
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try { await context.fs.rename(temporary, target); return; }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (!code || !["EPERM", "EBUSY", "EACCES"].includes(code) || attempt === 7) throw error;
        await delay(40 * (attempt + 1));
      }
    }
  } catch (error) {
    if (handle) await handle.close();
    try { await context.fs.unlink(temporary); } catch {}
    throw error;
  }
}
