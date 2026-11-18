import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPerformanceFixture } from "./create-performance-fixture.mjs";
import { resetPerformanceState } from "./reset-performance-state.mjs";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
export async function boundedSnapshotTest() {
  const fixture = await createPerformanceFixture(225, 32);
  try {
    const work = fixture.db.collection("tsn_receiver_work");
    const page = await work.orderBy("createdAt", "asc").limit(200).get();
    assert.equal(page.docs.length, 200);
    for (let index = 0; index < page.docs.length; index += 1) {
      const id = "work-" + String(index).padStart(3, "0");
      assert.equal(page.docs[index].id, id);
      assert.deepEqual(page.docs[index].data(), fixture.initial.tsn_receiver_work[id]);
    }
    assert.equal(fixture.state.recordReads, 225);
    for (const record of fixture.state.recordPaths) assert.ok(record.includes(path.sep + "epochs" + path.sep));
    assert.ok(fixture.state.peak > 1 && fixture.state.peak <= 16);
    assert.equal(fixture.state.active, 0);
    assert.equal(fixture.state.readsAfterUnlock, 0);
    resetPerformanceState(fixture.state);
    const continuation = await work.orderBy("createdAt", "asc").startAfter(page.docs[199]).limit(200).get();
    assert.equal(continuation.docs.length, 25);
    assert.equal(continuation.docs[0].id, "work-200");
    assert.equal(fixture.state.recordReads, 225);
    const manifest = JSON.parse(await readFile(fixture.file, "utf8"));
    const metadataFile = path.join(fixture.file + ".d", ...manifest.collections.metadata["state-31"].split("/"));
    await writeFile(metadataFile, "{damaged unrelated metadata");
    resetPerformanceState(fixture.state);
    const independent = await work.limit(1).get();
    assert.equal(independent.docs.length, 1);
    assert.equal(independent.docs[0].id, "work-000");
    assert.equal(fixture.state.recordReads, 225);
    assert.equal(fixture.state.recordPaths.includes(metadataFile), false);
    assert.equal(fixture.state.active, 0);
    assert.equal(fixture.state.readsAfterUnlock, 0);
    assert.equal(await readFile(metadataFile, "utf8"), "{damaged unrelated metadata");
  } finally { await cleanupStorageFixture(fixture); }
}
