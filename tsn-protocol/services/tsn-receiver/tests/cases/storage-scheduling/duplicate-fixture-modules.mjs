import { cp } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
export async function duplicateFixtureModules(fixture) {
  const directory = path.join(fixture.directory, "duplicate-lib");
  await cp(fixture.moduleDirectory, directory, { recursive: true });
  const { createStoreContext } = await import(pathToFileURL(path.join(directory, "storage/local/create-store-context.mjs")).href);
  const { withFileLock } = await import(pathToFileURL(path.join(directory, "storage/local/with-file-lock.mjs")).href);
  const { readStore } = await import(pathToFileURL(path.join(directory, "storage/local/read-store.mjs")).href);
  const { mutateStore } = await import(pathToFileURL(path.join(directory, "storage/local/mutate-store.mjs")).href);
  const { ensureStoreReady } = await import(pathToFileURL(path.join(directory, "storage/local/ensure-store-ready.mjs")).href);
  return { createStoreContext, withFileLock, readStore, mutateStore, ensureStoreReady };
}
