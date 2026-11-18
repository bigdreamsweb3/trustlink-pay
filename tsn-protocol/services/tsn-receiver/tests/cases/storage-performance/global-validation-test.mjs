import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPerformanceFixture } from "./create-performance-fixture.mjs";
import { resetPerformanceState } from "./reset-performance-state.mjs";
import { readTransactionDocument } from "./read-transaction-document.mjs";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";

export async function globalValidationTest() {
  const fixture = await createPerformanceFixture(4, 1);
  try {
    const before = await readFile(fixture.file, "utf8");
    const manifest = JSON.parse(before);
    const metadata = path.join(fixture.file + ".d", ...manifest.collections.metadata["state-0"].split("/"));
    const reference = fixture.db.collection("tsn_receiver_work").doc("work-000");
    await writeFile(metadata, "{damaged unrelated metadata");
    await assert.rejects(fixture.db.runTransaction(readTransactionDocument.bind(null, reference)), /LOCAL_RECORD_INVALID/);
    assert.ok(fixture.state.recordPaths.includes(metadata));
    resetPerformanceState(fixture.state);
    await assert.rejects(reference.set({ stateVersion: 99 }, { merge: true }), /LOCAL_RECORD_INVALID/);
    assert.ok(fixture.state.recordPaths.includes(metadata));
    assert.equal(await readFile(fixture.file, "utf8"), before);
    assert.equal(await readFile(metadata, "utf8"), "{damaged unrelated metadata");
    const relative = manifest.collections.tsn_receiver_work["work-000"];
    const changed = { ...fixture.initial.tsn_receiver_work["work-000"], stateVersion: 99 };
    const journal = path.join(fixture.file + ".d", "transaction.json");
    const journalBytes = JSON.stringify({ format: "TSN_RECEIVER_FILE_TRANSACTION", version: 1, manifest, writes: [{ path: relative, row: changed }], deletes: [] });
    await writeFile(journal, journalBytes);
    resetPerformanceState(fixture.state);
    await assert.rejects(reference.get(), /LOCAL_JOURNAL_INVALID/);
    assert.ok(fixture.state.recordPaths.includes(metadata));
    assert.equal(await readFile(fixture.file, "utf8"), before);
    assert.equal(await readFile(journal, "utf8"), journalBytes);
    assert.equal(await readFile(metadata, "utf8"), "{damaged unrelated metadata");
    await writeFile(metadata, JSON.stringify(fixture.initial.metadata["state-0"], null, 2));
    resetPerformanceState(fixture.state);
    assert.deepEqual((await reference.get()).data(), changed);
    await assert.rejects(access(journal), { code: "ENOENT" });
    await assert.rejects(access(fixture.file + ".lock"), { code: "ENOENT" });
    assert.equal(fixture.state.active, 0);
    assert.equal(fixture.state.readsAfterUnlock, 0);
  } finally { await cleanupStorageFixture(fixture); }
}
