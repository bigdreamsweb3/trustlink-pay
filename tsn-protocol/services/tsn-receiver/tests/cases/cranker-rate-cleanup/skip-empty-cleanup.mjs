import assert from "node:assert/strict";
import { createRateCleanupFixture } from "./create-rate-cleanup-fixture.mjs";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";

export async function skipEmptyCleanup() {
  const fixture = await createRateCleanupFixture({ current: { count: 29, updatedAt: "2026-11-17T12:01:00.000Z" } });
  try {
    await fixture.prune(fixture.dependencies, "2026-11-17T12:00:00.000Z");
    assert.equal(fixture.batches, 0);
    assert.equal(fixture.commits, 0);
    assert.equal(fixture.stagedDeletes, 0);
    assert.equal((await fixture.dependencies.rateCollection.doc("current").get()).get("count"), 29);
  } finally {
    await cleanupStorageFixture(fixture);
  }
}
