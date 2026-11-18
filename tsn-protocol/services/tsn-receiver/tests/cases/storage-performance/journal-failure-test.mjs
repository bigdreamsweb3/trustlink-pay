import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createPerformanceFixture } from "./create-performance-fixture.mjs";
import { firstRecordError } from "./first-record-error.mjs";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
export async function journalFailureTest() {
  const fixture = await createPerformanceFixture(48);
  try {
    const { validateJournalRecords } = await import(pathToFileURL(path.join(fixture.moduleDirectory, "storage/local/validate-journal-records.mjs")).href);
    const before = await readFile(fixture.file, "utf8");
    const manifest = JSON.parse(before);
    const first = path.join(fixture.file + ".d", ...manifest.collections.tsn_receiver_work["work-000"].split("/"));
    const second = path.join(fixture.file + ".d", ...manifest.collections.tsn_receiver_work["work-001"].split("/"));
    fixture.state.failures.set(first, "FIRST_RECORD_FAILURE");
    fixture.state.failures.set(second, "SECOND_RECORD_FAILURE");
    fixture.state.delays.set(first, 40);
    fixture.state.delays.set(second, 0);
    const journal = { format: "TSN_RECEIVER_FILE_TRANSACTION", version: 1, manifest, writes: [], deletes: [] };
    await assert.rejects(fixture.withFileLock(fixture.db.context, validateJournalRecords.bind(null, fixture.db.context, journal)), firstRecordError);
    assert.equal(fixture.state.active, 0);
    assert.equal(fixture.state.readsAfterUnlock, 0);
    assert.equal(fixture.state.recordReads, 16);
    assert.equal(await readFile(fixture.file, "utf8"), before);
    fixture.state.failures.clear();
    assert.equal((await fixture.db.collection("tsn_receiver_work").get()).docs.length, 48);
    assert.equal(fixture.state.active, 0);
    assert.equal(fixture.state.readsAfterUnlock, 0);
  } finally { await cleanupStorageFixture(fixture); }
}
