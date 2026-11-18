import test from "node:test";
import { boundedSnapshotTest } from "./cases/storage-performance/bounded-snapshot-test.mjs";
import { snapshotFailureTest } from "./cases/storage-performance/snapshot-failure-test.mjs";
import { journalFailureTest } from "./cases/storage-performance/journal-failure-test.mjs";
import { selectiveDocumentReadTest } from "./cases/storage-performance/selective-document-read-test.mjs";
import { globalValidationTest } from "./cases/storage-performance/global-validation-test.mjs";
import { selectedSymlinkTest } from "./cases/storage-performance/selected-symlink-test.mjs";

test("bounded collection reads preserve query order and avoid unrelated metadata records", boundedSnapshotTest);
test("ordinary point reads load only their indexed record and observe current uncached bytes", selectiveDocumentReadTest);
test("transactions, mutations and journal recovery still validate unrelated committed records", globalValidationTest);
test("selected ordinary records reject symlink redirection while independent metadata stays readable", selectedSymlinkTest);
test("failed parallel snapshot reads settle under the lock before returning the first ordered error", snapshotFailureTest);
test("failed parallel journal preflight settles every read before releasing the lock", journalFailureTest);
