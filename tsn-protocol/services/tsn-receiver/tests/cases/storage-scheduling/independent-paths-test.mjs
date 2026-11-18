import assert from "node:assert/strict";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
import { createSchedulingFixture } from "./create-scheduling-fixture.mjs";
import { createGate } from "./create-gate.mjs";
import { holdOperation } from "./hold-operation.mjs";
import { returnValue } from "./return-value.mjs";
export async function independentPathsTest() {
  const fixture = await createSchedulingFixture();
  const state = { entered: createGate(), release: createGate() };
  let holder, other;
  try {
    const second = fixture.createStoreContext({ file: path.join(fixture.directory, "independent.json") });
    await fixture.ensureStoreReady(second);
    holder = fixture.withFileLock(fixture.localDb.context, holdOperation.bind(null, state));
    await state.entered.promise;
    other = fixture.withFileLock(second, returnValue.bind(null, "independent-acquired"));
    assert.equal(await Promise.race([other, delay(2_000, "independent-path-timed-out")]), "independent-acquired");
  } finally {
    state.release.resolve();
    await Promise.allSettled([holder, other]);
    await cleanupStorageFixture(fixture);
  }
}
