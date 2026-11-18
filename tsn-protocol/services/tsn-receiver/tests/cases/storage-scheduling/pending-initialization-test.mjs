import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
import { createSchedulingFixture } from "./create-scheduling-fixture.mjs";
import { createGate } from "./create-gate.mjs";
import { holdAndProbePendingInitialization } from "./hold-and-probe-pending-initialization.mjs";
import { markInitializationFinished } from "./mark-initialization-finished.mjs";
export async function pendingInitializationTest() {
  const fixture = await createSchedulingFixture();
  const state = { fixture, entered: createGate(), attemptNested: createGate(), probed: createGate(), release: createGate(), mutationCalls: 0, initializationFinished: false };
  let holder, initialization;
  try {
    state.second = fixture.createStoreContext({ file: fixture.file });
    assert.equal(state.second.initialized, false);
    holder = fixture.mutateStore(fixture.localDb.context, holdAndProbePendingInitialization.bind(null, state));
    await state.entered.promise;
    // This call originates outside the owner's ALS scope. Its initializer is
    // allowed to wait in FIFO while the owner probes the same pending context.
    initialization = fixture.ensureStoreReady(state.second).then(markInitializationFinished.bind(null, state));
    assert.equal(state.second.initialized, true);
    assert.equal(state.initializationFinished, false);
    state.attemptNested.resolve();
    await Promise.race([state.probed.promise, holder]);
    assert.equal(state.initializationFinished, false);
    state.release.resolve();
    await holder;
    await initialization;
    assert.equal(state.initializationFinished, true);
    assert.equal((await fixture.readStore(state.second))["scheduler-state"].row.version, 1);
    assert.equal(state.mutationCalls, 0);
    await assert.rejects(access(`${fixture.file}.lock`), { code: "ENOENT" });
  } finally {
    state.attemptNested.resolve();
    state.release.resolve();
    await Promise.allSettled([holder, initialization]);
    await cleanupStorageFixture(fixture);
  }
}
