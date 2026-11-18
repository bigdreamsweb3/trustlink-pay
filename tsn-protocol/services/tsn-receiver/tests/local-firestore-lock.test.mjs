import test from "node:test";
import { lockRetryTest } from "./cases/storage/lock-retry-test.mjs";
import { liveOldLockTest } from "./cases/storage/live-old-lock-test.mjs";
// The outer deadline includes source-fixture compilation and real Windows I/O;
// retry counts and exclusion are asserted independently inside the case.
test("exclusive local-store lock preserves Windows retries and cross-worker exclusion", { timeout: 60_000 }, lockRetryTest);
test("an old lock held by a live process cannot be stolen", liveOldLockTest);
