import assert from "node:assert/strict";
import { createRateCleanupFixture } from "./create-rate-cleanup-fixture.mjs";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";

export async function pruneExpiredRatesInOneBatch() {
  const cutoff = "2026-11-17T12:00:00.000Z";
  const rows = {};
  for (let index = 0; index < 103; index += 1) {
    rows["expired-" + String(index).padStart(3, "0")] = { count: index + 1, updatedAt: "2026-11-17T11:59:00.000Z" };
  }
  const fixture = await createRateCleanupFixture(rows);
  try {
    await fixture.prune(fixture.dependencies, cutoff);
    const remaining = await fixture.dependencies.rateCollection.get();
    assert.equal(fixture.batches, 1);
    assert.equal(fixture.commits, 1);
    assert.equal(fixture.stagedDeletes, 100, "the existing query limit bounds the one commit");
    assert.equal(remaining.docs.length, 3, "the bounded remainder stays available for later cleanup");
    for (const row of remaining.docs) assert.deepEqual(row.data(), rows[row.id]);
  } finally {
    await cleanupStorageFixture(fixture);
  }
}
