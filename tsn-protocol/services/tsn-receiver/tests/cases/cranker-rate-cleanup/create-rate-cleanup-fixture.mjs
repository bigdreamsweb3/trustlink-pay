import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { createStorageFixture } from "../storage/create-storage-fixture.mjs";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
import { loadReceiverFixtureModule } from "../shared/load-receiver-fixture-module.mjs";
import { captureRateBatch } from "./capture-rate-batch.mjs";

/** Compile the cleanup component against an isolated real local database. */
export async function createRateCleanupFixture(rows) {
  const fixture = await createStorageFixture({ test_cranker_rates: rows });
  try {
    await compileReceiverFixture(fixture.moduleDirectory, ["authentication/cranker/prune-cranker-rate-limits.ts"]);
    const { pruneCrankerRateLimits } = await loadReceiverFixtureModule(fixture.moduleDirectory, "authentication/cranker/prune-cranker-rate-limits");
    const context = { ...fixture, batches: 0, commits: 0, stagedDeletes: 0, failure: null };
    context.dependencies = {
      rateCollection: fixture.localDb.collection("test_cranker_rates"),
      database: { batch: captureRateBatch.bind(null, context) },
    };
    context.prune = pruneCrankerRateLimits;
    return context;
  } catch (error) {
    await cleanupStorageFixture(fixture);
    throw error;
  }
}
