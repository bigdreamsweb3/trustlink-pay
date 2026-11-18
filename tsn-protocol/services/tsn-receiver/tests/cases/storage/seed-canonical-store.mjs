import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Seed ordered canonical records in an isolated fixture without adapter conversion. */
export async function seedCanonicalStore(context, initial, recordPath) {
  const manifest = { format: "TSN_RECEIVER_FILE_STORE", version: 1, collections: Object.create(null) };
  await mkdir(context.directory, { recursive: true });
  for (const [collection, rows] of Object.entries(initial)) {
    const records = Object.create(null);
    manifest.collections[collection] = records;
    for (const [id, row] of Object.entries(rows)) {
      const relative = recordPath(context, collection, id, row);
      const destination = path.join(context.directory, ...relative.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, JSON.stringify(row, null, 2));
      records[id] = relative;
    }
  }
  await writeFile(context.file, JSON.stringify(manifest, null, 2));
}
