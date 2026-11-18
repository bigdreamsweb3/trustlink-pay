import path from "node:path";
import { pathToFileURL } from "node:url";
import { createStorageFixture } from "../storage/create-storage-fixture.mjs";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
export async function createSchedulingFixture() {
  const fixture = await createStorageFixture({ "scheduler-state": { row: { id: "row", version: 0 } } });
  try {
    const { readStore } = await import(pathToFileURL(path.join(fixture.moduleDirectory, "storage/local/read-store.mjs")).href);
    const { mutateStore } = await import(pathToFileURL(path.join(fixture.moduleDirectory, "storage/local/mutate-store.mjs")).href);
    return { ...fixture, readStore, mutateStore };
  } catch (error) {
    await cleanupStorageFixture(fixture);
    throw error;
  }
}
