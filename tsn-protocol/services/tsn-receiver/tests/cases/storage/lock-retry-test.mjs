import assert from "node:assert/strict";
import { access, readFile, writeFile, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";
import { filesystemPort } from "./filesystem-port.mjs";
import { resetFilesystemState } from "./reset-filesystem-state.mjs";
import { lockedOperation } from "./locked-operation.mjs";
import { releaseHeldLock } from "./release-held-lock.mjs";
import { markHeldLock } from "./mark-held-lock.mjs";
import { holdLockedOperation } from "./hold-locked-operation.mjs";
export async function lockRetryTest() {
  const fixture = await createStorageFixture();
  const state = {file:fixture.file,lockFile:fixture.file+".lock",operationCount:0};
  resetFilesystemState(state);
  const context = fixture.createStoreContext({file:fixture.file,fs:filesystemPort(state)});
  await context.ready;
  try {
    resetFilesystemState(state,["EPERM","EACCES"]);
    assert.equal(await fixture.withFileLock(context,lockedOperation.bind(null,state,state.lockFile)),"acquired");
    assert.equal(state.operationCount,1);
    assert.equal(state.opens.length,3);
    assert.deepEqual(state.stats,[]);
    assert.deepEqual(state.unlinks,[[state.lockFile]]);
    await assert.rejects(access(state.lockFile),{code:"ENOENT"});
    for (const code of ["EPERM","EACCES"]) {
      await writeFile(state.lockFile,"fixture-existing-lock");
      resetFilesystemState(state,Array(12).fill(code));
      const before = state.operationCount;
      await assert.rejects(fixture.withFileLock(context,lockedOperation.bind(null,state,state.lockFile)),{code});
      assert.equal(state.operationCount,before); assert.equal(state.opens.length,8);
      assert.deepEqual(state.stats,[]); assert.deepEqual(state.unlinks,[]);
      assert.equal(await readFile(state.lockFile,"utf8"),"fixture-existing-lock");
      await unlink(state.lockFile);
    }
    resetFilesystemState(state,["EIO","EPERM"]);
    await assert.rejects(fixture.withFileLock(context,lockedOperation.bind(null,state,state.lockFile)),{code:"EIO"});
    assert.equal(state.opens.length,1); assert.deepEqual(state.unlinks,[]);
    resetFilesystemState(state);
    state.hold = new Promise(releaseHeldLock.bind(null,state));
    const acquired = new Promise(markHeldLock.bind(null,state));
    const holder = fixture.withFileLock(context,holdLockedOperation.bind(null,state));
    await acquired;
    resetFilesystemState(state,["EPERM","EACCES"]);
    const before = state.operationCount;
    const competitor = fixture.withFileLock(context,lockedOperation.bind(null,state,state.lockFile));
    try {
      await delay(50);
      assert.equal(state.operationCount,before);
      assert.deepEqual(state.opens,[]); assert.deepEqual(state.stats,[]);
      assert.deepEqual(state.unlinks,[]);
    } finally { state.release(); await holder; await competitor; }
    assert.equal(state.operationCount,before+1);
    assert.equal(state.opens.length,3); assert.deepEqual(state.stats,[]);
    assert.deepEqual(state.unlinks,[[state.lockFile],[state.lockFile]]);
  } finally { await cleanupStorageFixture(fixture); }
}
