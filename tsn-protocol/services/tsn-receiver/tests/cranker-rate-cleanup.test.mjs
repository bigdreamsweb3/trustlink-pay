import test from "node:test";
import { pruneExpiredRatesInOneBatch } from "./cases/cranker-rate-cleanup/prune-expired-rates-in-one-batch.mjs";
import { preserveCurrentRates } from "./cases/cranker-rate-cleanup/preserve-current-rates.mjs";
import { skipEmptyCleanup } from "./cases/cranker-rate-cleanup/skip-empty-cleanup.mjs";
import { propagateCleanupCommitFailure } from "./cases/cranker-rate-cleanup/propagate-cleanup-commit-failure.mjs";

test("Cranker cleanup deletes one hundred expired counters in one bounded batch", pruneExpiredRatesInOneBatch);
test("Cranker cleanup retains current rate counters and the exact cutoff boundary", preserveCurrentRates);
test("Cranker cleanup does not allocate or commit an empty batch", skipEmptyCleanup);
test("Cranker cleanup propagates the batch failure without deleting selected counters", propagateCleanupCommitFailure);
