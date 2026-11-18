import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
import { filesystemPort } from "../storage/filesystem-port.mjs";
import { resetFilesystemState } from "../storage/reset-filesystem-state.mjs";
import { createSchedulingFixture } from "./create-scheduling-fixture.mjs";
import { duplicateFixtureModules } from "./duplicate-fixture-modules.mjs";
import { createGate } from "./create-gate.mjs";
import { holdOperation } from "./hold-operation.mjs";
import { returnValue } from "./return-value.mjs";
export async function duplicateModulesTest() {
  const fixture = await createSchedulingFixture();
  const state = { file: fixture.file, lockFile: `${fixture.file}.lock`, entered: createGate(), release: createGate() };
  let holder, competitor;
  try {
    const duplicate = await duplicateFixtureModules(fixture);
    assert.notEqual(duplicate.withFileLock, fixture.withFileLock);
    resetFilesystemState(state);
    const second = duplicate.createStoreContext({ file: fixture.file, fs: filesystemPort(state) });
    await duplicate.ensureStoreReady(second);
    resetFilesystemState(state);
    holder = fixture.withFileLock(fixture.localDb.context, holdOperation.bind(null, state));
    await state.entered.promise;
    competitor = duplicate.withFileLock(second, returnValue.bind(null, "duplicate-acquired"));
    await delay(50);
    assert.deepEqual(state.opens, []);
    assert.deepEqual(state.stats, []);
    assert.deepEqual(state.unlinks, []);
    state.release.resolve();
    await holder;
    assert.equal(await competitor, "duplicate-acquired");
    assert.equal(state.opens.length, 1);
    assert.deepEqual(state.stats, []);
    await assert.rejects(access(state.lockFile), { code: "ENOENT" });
  } finally {
    state.release.resolve();
    await Promise.allSettled([holder, competitor]);
    await cleanupStorageFixture(fixture);
  }
}
