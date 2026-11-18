import assert from "node:assert/strict";
import { createRateCleanupFixture } from "./create-rate-cleanup-fixture.mjs";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";

export async function propagateCleanupCommitFailure() {
  const rows = {
    expired: { count: 7, updatedAt: "2026-11-17T11:59:59.999Z" },
    boundary: { count: 8, updatedAt: "2026-11-17T12:00:00.000Z" },
    current: { count: 29, updatedAt: "2026-11-17T12:00:00.001Z" },
  };
  const fixture = await createRateCleanupFixture(rows);
  try {
    fixture.failure = new Error("SYNTHETIC_RATE_BATCH_COMMIT_FAILURE");
    let caught;
    try { await fixture.prune(fixture.dependencies, "2026-11-17T12:00:00.000Z"); }
    catch (error) { caught = error; }
    assert.equal(caught, fixture.failure, "the original commit failure must propagate");
    assert.equal(fixture.batches, 1);
    assert.equal(fixture.commits, 1);
    assert.equal(fixture.stagedDeletes, 2);
    const remaining = await fixture.dependencies.rateCollection.get();
    assert.equal(remaining.docs.length, Object.keys(rows).length);
    for (const row of remaining.docs) assert.deepEqual(row.data(), rows[row.id]);
  } finally {
    await cleanupStorageFixture(fixture);
  }
}
