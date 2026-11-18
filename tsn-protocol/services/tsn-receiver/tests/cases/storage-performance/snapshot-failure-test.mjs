import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPerformanceFixture } from "./create-performance-fixture.mjs";
import { firstRecordError } from "./first-record-error.mjs";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
export async function snapshotFailureTest() {
  const fixture = await createPerformanceFixture(48);
  try {
    const manifest = JSON.parse(await readFile(fixture.file, "utf8"));
    const first = path.join(fixture.file + ".d", ...manifest.collections.tsn_receiver_work["work-000"].split("/"));
    const second = path.join(fixture.file + ".d", ...manifest.collections.tsn_receiver_work["work-001"].split("/"));
    fixture.state.failures.set(first, "FIRST_RECORD_FAILURE");
    fixture.state.failures.set(second, "SECOND_RECORD_FAILURE");
    fixture.state.delays.set(first, 40);
    fixture.state.delays.set(second, 0);
    await assert.rejects(fixture.db.collection("tsn_receiver_work").get(), firstRecordError);
    assert.equal(fixture.state.active, 0);
    assert.equal(fixture.state.readsAfterUnlock, 0);
    assert.equal(fixture.state.recordReads, 16);
    fixture.state.failures.clear();
    await fixture.db.collection("tsn_receiver_work").doc("work-000").set({ stateVersion: 99 }, { merge: true });
    assert.equal((await fixture.db.collection("tsn_receiver_work").doc("work-000").get()).get("stateVersion"), 99);
    assert.equal(fixture.state.active, 0);
    assert.equal(fixture.state.readsAfterUnlock, 0);
  } finally { await cleanupStorageFixture(fixture); }
}
