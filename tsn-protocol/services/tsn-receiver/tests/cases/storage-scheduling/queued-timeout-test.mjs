import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
import { createSchedulingFixture } from "./create-scheduling-fixture.mjs";
import { createGate } from "./create-gate.mjs";
import { holdOperation } from "./hold-operation.mjs";
import { writeVersion } from "./write-version.mjs";
export async function queuedTimeoutTest() {
  const fixture = await createSchedulingFixture();
  const state = { entered: createGate(), release: createGate(), mutationCalls: 0 };
  let holder, queued;
  try {
    const second = fixture.createStoreContext({ file: fixture.file });
    await fixture.ensureStoreReady(second);
    const before = await readFile(fixture.file, "utf8");
    holder = fixture.withFileLock(fixture.localDb.context, holdOperation.bind(null, state));
    await state.entered.promise;
    const started = Date.now();
    queued = fixture.mutateStore(second, writeVersion.bind(null, state, 99));
    await assert.rejects(queued, /TSN_RECEIVER_LOCAL_STORE_BUSY/);
    assert.ok(Date.now() - started >= 9_000);
    assert.equal(state.mutationCalls, 0);
    assert.equal(await readFile(fixture.file, "utf8"), before);
    state.release.resolve();
    await holder;
    assert.equal((await fixture.readStore(second))["scheduler-state"].row.version, 0);
    assert.equal(state.mutationCalls, 0);
    await assert.rejects(access(`${fixture.file}.lock`), { code: "ENOENT" });
  } finally {
    state.release.resolve();
    await Promise.allSettled([holder, queued]);
    await cleanupStorageFixture(fixture);
  }
}
