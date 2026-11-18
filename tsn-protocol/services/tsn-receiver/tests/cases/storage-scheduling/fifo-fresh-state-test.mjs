import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
import { createSchedulingFixture } from "./create-scheduling-fixture.mjs";
import { createGate } from "./create-gate.mjs";
import { holdMutation } from "./hold-mutation.mjs";
import { captureReadVersion } from "./capture-read-version.mjs";
import { writeVersion } from "./write-version.mjs";
export async function fifoFreshStateTest() {
  const fixture = await createSchedulingFixture();
  const state = { entered: createGate(), release: createGate(), events: [], mutationCalls: 0 };
  let holder, reader, writer;
  try {
    const first = fixture.localDb.context;
    const second = fixture.createStoreContext({ file: fixture.file });
    await fixture.ensureStoreReady(second);
    holder = fixture.mutateStore(first, holdMutation.bind(null, state));
    await state.entered.promise;
    reader = fixture.readStore(second).then(captureReadVersion.bind(null, state));
    writer = fixture.mutateStore(second, writeVersion.bind(null, state, 2));
    await delay(50);
    assert.deepEqual(state.events, ["first-start"]);
    assert.equal(state.mutationCalls, 0);
    state.release.resolve();
    await holder;
    assert.equal(await reader, 1);
    assert.equal(await writer, 2);
    assert.deepEqual(state.events, ["first-start", "first-end", "read:1", "write:2"]);
    assert.equal((await fixture.readStore(first))["scheduler-state"].row.version, 2);
  } finally {
    state.release.resolve();
    await Promise.allSettled([holder, reader, writer]);
    await cleanupStorageFixture(fixture);
  }
}
