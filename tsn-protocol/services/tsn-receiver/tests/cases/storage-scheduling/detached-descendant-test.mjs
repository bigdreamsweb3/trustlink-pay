import assert from "node:assert/strict";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
import { createSchedulingFixture } from "./create-scheduling-fixture.mjs";
import { duplicateFixtureModules } from "./duplicate-fixture-modules.mjs";
import { createGate } from "./create-gate.mjs";
import { startDetachedRead } from "./start-detached-read.mjs";
export async function detachedDescendantTest() {
  const fixture = await createSchedulingFixture();
  const state = { releaseChild: createGate(), child: undefined };
  try {
    state.duplicate = await duplicateFixtureModules(fixture);
    state.second = state.duplicate.createStoreContext({ file: fixture.file });
    await state.duplicate.ensureStoreReady(state.second);
    await fixture.mutateStore(fixture.localDb.context, startDetachedRead.bind(null, state));
    state.releaseChild.resolve();
    assert.equal((await state.child)["scheduler-state"].row.version, 1);
  } finally {
    state.releaseChild.resolve();
    await Promise.allSettled([state.child]);
    await cleanupStorageFixture(fixture);
  }
}
