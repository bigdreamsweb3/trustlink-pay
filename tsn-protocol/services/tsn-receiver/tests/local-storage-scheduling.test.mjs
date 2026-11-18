import test from "node:test";
import { fifoFreshStateTest } from "./cases/storage-scheduling/fifo-fresh-state-test.mjs";
import { duplicateModulesTest } from "./cases/storage-scheduling/duplicate-modules-test.mjs";
import { failureCleanupTest } from "./cases/storage-scheduling/failure-cleanup-test.mjs";
import { queuedTimeoutTest } from "./cases/storage-scheduling/queued-timeout-test.mjs";
import { nestedOperationsTest } from "./cases/storage-scheduling/nested-operations-test.mjs";
import { detachedDescendantTest } from "./cases/storage-scheduling/detached-descendant-test.mjs";
import { independentPathsTest } from "./cases/storage-scheduling/independent-paths-test.mjs";
import { pendingInitializationTest } from "./cases/storage-scheduling/pending-initialization-test.mjs";

test("same-path reads and mutations share FIFO scheduling across contexts and read fresh committed state", fifoFreshStateTest);
test("separately compiled module instances share the filesystem-path scheduler", duplicateModulesTest);
test("failed scheduled mutations release ownership and do not poison later operations", failureCleanupTest);
test("a timed-out queued mutation never executes after the current owner releases its lock", { timeout: 25_000 }, queuedTimeoutTest);
test("same-path nested reads and mutations fail promptly across duplicated modules", { timeout: 30_000 }, nestedOperationsTest);
test("nested operations reject promptly while another same-path context awaits queued initialization", { timeout: 30_000 }, pendingInitializationTest);
test("an inherited async descendant can acquire fresh state after its parent releases ownership", detachedDescendantTest);
test("different filesystem paths retain independent lock scheduling", independentPathsTest);
