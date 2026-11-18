import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";
import { snapshotIdentifiers } from "./snapshot-identifiers.mjs";
import { manifestRow } from "./manifest-row.mjs";

export async function canonicalRoundtripTest() {
  const initial = {
    tsn_receiver_work: {
      second: { id: "second", kind: "SETTLEMENT", payload: { intentId: "funding" }, status: "RECEIVED", stateVersion: 3 },
      first: { id: "first", kind: "TCAP_EPOCH_ACCOUNTING", payload: { accountingEpoch: "synthetic-epoch" }, status: "FAILED", stateVersion: 7 },
      retired: { id: "retired", kind: "TCAP_FUNDING_POOL", payload: {}, status: "FAILED", stateVersion: 9 },
    },
    sessions: { session: { counter: 4 } },
    state: { bucket: { value: "ready" } },
    "state/bucket/items": { item: { field: "item", value: "one" } },
    tsn_private_credit_locks: { "global-root": { workId: "second" } },
  };
  const fixture = await createStorageFixture(initial);
  try {
    const manifest = JSON.parse(await readFile(fixture.file, "utf8"));
    assert.deepEqual(Object.keys(manifest), ["format", "version", "collections"]);
    assert.equal(manifest.format, "TSN_RECEIVER_FILE_STORE");
    assert.equal(manifest.version, 1);
    assert.equal(Object.hasOwn(manifest, "tsn_receiver_work"), false);
    assert.deepEqual(snapshotIdentifiers(await fixture.localDb.collection("tsn_receiver_work").get()), ["second", "first", "retired"]);
    for (const [collection, rows] of Object.entries(initial)) {
      for (const [id, row] of Object.entries(rows)) {
        assert.equal(typeof manifest.collections[collection][id], "string");
        assert.deepEqual((await manifestRow(fixture, collection, id)).row, row);
        assert.deepEqual((await fixture.localDb.collection(collection).doc(id).get()).data(), row);
      }
    }
    const updated = { ...initial.tsn_receiver_work.second, status: "VERIFIED" };
    await fixture.localDb.collection("tsn_receiver_work").doc("second").set(updated);
    assert.deepEqual(snapshotIdentifiers(await fixture.localDb.collection("tsn_receiver_work").limit(2).get()), ["second", "first"]);
    const restarted = new fixture.LocalDb(fixture.createStoreContext({ file: fixture.file }));
    assert.deepEqual((await restarted.collection("tsn_receiver_work").doc("second").get()).data(), updated);
    assert.deepEqual(snapshotIdentifiers(await restarted.collection("tsn_receiver_work").get()), ["second", "first", "retired"]);
    assert.deepEqual((await restarted.collection("state/bucket/items").doc("item").get()).data(), initial["state/bucket/items"].item);
    await assert.rejects(access(path.join(fixture.file + ".d", "legacy-backup.json")), { code: "ENOENT" });
  } finally { await cleanupStorageFixture(fixture); }
}
