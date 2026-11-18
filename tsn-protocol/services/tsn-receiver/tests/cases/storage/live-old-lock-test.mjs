import assert from "node:assert/strict";
import { access, readFile, writeFile, utimes } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";
export async function liveOldLockTest() {
  const fixture = await createStorageFixture();
  try {
    const { reclaimStaleLock } = await import(pathToFileURL(path.join(fixture.moduleDirectory,"storage/local/reclaim-stale-lock.mjs")).href);
    const lock = fixture.file+".lock";
    const contents = JSON.stringify({pid:process.pid,token:"synthetic-live-lock"});
    await writeFile(lock,contents);
    await utimes(lock,new Date(0),new Date(0));
    assert.equal(await reclaimStaleLock(fixture.localDb.context),false);
    assert.equal(await readFile(lock,"utf8"),contents); await access(lock);
  } finally { await cleanupStorageFixture(fixture); }
}
