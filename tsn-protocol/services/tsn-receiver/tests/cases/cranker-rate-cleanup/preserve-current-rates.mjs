import assert from "node:assert/strict";
import { createRateCleanupFixture } from "./create-rate-cleanup-fixture.mjs";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";

export async function preserveCurrentRates() {
  const cutoff = "2026-11-17T12:00:00.000Z";
  const rows = {
    expired: { count: 7, updatedAt: "2026-11-17T11:59:59.999Z" },
    boundary: { count: 8, updatedAt: cutoff },
    current: { count: 29, updatedAt: "2026-11-17T12:00:00.001Z" },
    future: { count: 30, updatedAt: "2026-11-17T12:01:00.000Z" },
  };
  const fixture = await createRateCleanupFixture(rows);
  try {
    await fixture.prune(fixture.dependencies, cutoff);
    const remaining = await fixture.dependencies.rateCollection.get();
    assert.equal(remaining.docs.length, 2);
    for (const row of remaining.docs) {
      assert.ok(row.id === "current" || row.id === "future");
      assert.deepEqual(row.data(), rows[row.id], "current counter values must remain intact");
    }
    assert.equal(fixture.batches, 1);
    assert.equal(fixture.commits, 1);
    assert.equal(fixture.stagedDeletes, 2, "updatedAt equal to the cutoff remains eligible");
  } finally {
    await cleanupStorageFixture(fixture);
  }
}
