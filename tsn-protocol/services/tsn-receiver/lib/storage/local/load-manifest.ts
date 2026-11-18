import { emptyManifest } from "./empty-manifest";
import { validateManifest } from "./validate-manifest";
import type { Manifest, StorageContext } from "./types";
/** Under the exclusive lock after journal recovery: validate the complete index without reading document payloads. */
export async function loadManifest(context: StorageContext): Promise<Manifest> {
  let raw;
  try { raw = await context.fs.readFile(context.file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyManifest();
    throw new Error("TSN_RECEIVER_LOCAL_STORE_INVALID: refusing to replace unreadable local state", { cause: error });
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (error) { throw new Error("TSN_RECEIVER_LOCAL_STORE_INVALID: refusing to replace unreadable local state", { cause: error }); }
  return validateManifest(context, parsed);
}
