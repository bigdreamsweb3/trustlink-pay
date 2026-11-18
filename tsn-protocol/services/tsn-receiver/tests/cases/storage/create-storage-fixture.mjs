import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { seedCanonicalStore } from "./seed-canonical-store.mjs";
export async function createStorageFixture(initial, initialize = true) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-receiver-storage-components-"));
  const file = path.join(directory,"receiver.json");
  const moduleDirectory = path.join(directory,"lib");
  const previous = process.env.TSN_RECEIVER_LOCAL_FILE;
  process.env.TSN_RECEIVER_LOCAL_FILE = file;
  try {
    if (typeof initial === "string") await writeFile(file, initial);
    await mkdir(moduleDirectory);
    await compileReceiverFixture(moduleDirectory, ["local-firestore.ts","storage/local/create-store-context.ts","storage/local/with-file-lock.ts","storage/local/read-store.ts"]);
    const { localDb, LocalDb } = await import(pathToFileURL(path.join(moduleDirectory,"local-firestore.mjs")).href);
    const { createStoreContext } = await import(pathToFileURL(path.join(moduleDirectory,"storage/local/create-store-context.mjs")).href);
    const { withFileLock } = await import(pathToFileURL(path.join(moduleDirectory,"storage/local/with-file-lock.mjs")).href);
    const { ensureStoreReady } = await import(pathToFileURL(path.join(moduleDirectory,"storage/local/ensure-store-ready.mjs")).href);
    const { recordPath } = await import(pathToFileURL(path.join(moduleDirectory,"storage/local/record-path.mjs")).href);
    if (initial !== undefined && typeof initial !== "string") await seedCanonicalStore(localDb.context, initial, recordPath);
    if (initialize) await ensureStoreReady(localDb.context);
    return { directory,file,moduleDirectory,localDb,LocalDb,createStoreContext,withFileLock,ensureStoreReady };
  } catch (error) { await rm(directory,{recursive:true,force:true}); throw error; }
  finally { if (previous === undefined) delete process.env.TSN_RECEIVER_LOCAL_FILE; else process.env.TSN_RECEIVER_LOCAL_FILE = previous; }
}
