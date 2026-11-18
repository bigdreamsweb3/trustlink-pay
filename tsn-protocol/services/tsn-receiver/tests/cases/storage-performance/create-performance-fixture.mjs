import { createStorageFixture } from "../storage/create-storage-fixture.mjs";
import { performanceFilesystem } from "./performance-filesystem.mjs";
import { resetPerformanceState } from "./reset-performance-state.mjs";
export async function createPerformanceFixture(workCount, metadataCount = 0) {
  const initial = { tsn_receiver_work: {}, metadata: {} };
  for (let index = 0; index < workCount; index += 1) {
    const id = "work-" + String(index).padStart(3, "0");
    initial.tsn_receiver_work[id] = { id, kind: "SETTLEMENT", payload: {}, stateVersion: index + 1, createdAt: new Date(index * 1000).toISOString() };
  }
  for (let index = 0; index < metadataCount; index += 1) initial.metadata["state-" + index] = { index };
  const fixture = await createStorageFixture(initial);
  const state = { file: fixture.file };
  resetPerformanceState(state);
  const context = fixture.createStoreContext({ file: fixture.file, fs: performanceFilesystem(state) });
  await fixture.ensureStoreReady(context);
  resetPerformanceState(state);
  return { ...fixture, initial, state, db: new fixture.LocalDb(context) };
}
