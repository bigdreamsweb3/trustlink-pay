import assert from "node:assert/strict";
import { readFile, rename, symlink } from "node:fs/promises";
import path from "node:path";
import { createPerformanceFixture } from "./create-performance-fixture.mjs";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";

export async function selectedSymlinkTest() {
  const fixture = await createPerformanceFixture(1, 1);
  try {
    const manifest = JSON.parse(await readFile(fixture.file, "utf8"));
    const record = path.join(fixture.file + ".d", ...manifest.collections.tsn_receiver_work["work-000"].split("/"));
    const originalDirectory = path.dirname(record);
    const outside = path.join(fixture.directory, "outside-records");
    assert.equal(originalDirectory, path.join(fixture.file + ".d", "epochs", "unassigned", "SETTLEMENT"));
    assert.equal(path.dirname(outside), fixture.directory);
    await rename(originalDirectory, outside);
    await symlink(outside, originalDirectory, "junction");
    const work = fixture.db.collection("tsn_receiver_work");
    await assert.rejects(work.doc("work-000").get(), /LOCAL_RECORD_INVALID/);
    await assert.rejects(work.get(), /LOCAL_RECORD_INVALID/);
    assert.deepEqual((await fixture.db.collection("metadata").doc("state-0").get()).data(), fixture.initial.metadata["state-0"]);
    assert.deepEqual(JSON.parse(await readFile(path.join(outside, path.basename(record)), "utf8")), fixture.initial.tsn_receiver_work["work-000"]);
    assert.equal(fixture.state.active, 0);
    assert.equal(fixture.state.readsAfterUnlock, 0);
  } finally { await cleanupStorageFixture(fixture); }
}
