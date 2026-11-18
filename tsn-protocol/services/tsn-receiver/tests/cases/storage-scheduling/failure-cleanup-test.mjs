import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
import { createSchedulingFixture } from "./create-scheduling-fixture.mjs";
import { failMutation } from "./fail-mutation.mjs";
import { writeVersion } from "./write-version.mjs";
export async function failureCleanupTest() {
  const fixture = await createSchedulingFixture();
  const state = { mutationCalls: 0 };
  let failure, followingRead;
  try {
    const second = fixture.createStoreContext({ file: fixture.file });
    await fixture.ensureStoreReady(second);
    const error = new Error("synthetic mutation rejection");
    failure = assert.rejects(fixture.mutateStore(fixture.localDb.context, failMutation.bind(null, error)), error);
    followingRead = fixture.readStore(second);
    await failure;
    assert.equal((await followingRead)["scheduler-state"].row.version, 0);
    assert.equal(await fixture.mutateStore(second, writeVersion.bind(null, state, 3)), 3);
    assert.equal((await fixture.readStore(fixture.localDb.context))["scheduler-state"].row.version, 3);
    await assert.rejects(access(`${fixture.file}.lock`), { code: "ENOENT" });
  } finally {
    await Promise.allSettled([failure, followingRead]);
    await cleanupStorageFixture(fixture);
  }
}
