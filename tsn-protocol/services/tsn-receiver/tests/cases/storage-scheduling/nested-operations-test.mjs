import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { cleanupStorageFixture } from "../storage/cleanup-storage-fixture.mjs";
import { createSchedulingFixture } from "./create-scheduling-fixture.mjs";
import { duplicateFixtureModules } from "./duplicate-fixture-modules.mjs";
import { probeNestedOperations } from "./probe-nested-operations.mjs";
export async function nestedOperationsTest() {
  const fixture = await createSchedulingFixture();
  try {
    const duplicate = await duplicateFixtureModules(fixture);
    const second = duplicate.createStoreContext({ file: fixture.file });
    await duplicate.ensureStoreReady(second);
    const state = { duplicate, second, mutationCalls: 0 };
    await fixture.mutateStore(fixture.localDb.context, probeNestedOperations.bind(null, state));
    assert.equal((await duplicate.readStore(second))["scheduler-state"].row.version, 1);
    assert.equal(state.mutationCalls, 0);
    await assert.rejects(access(`${fixture.file}.lock`), { code: "ENOENT" });
  } finally { await cleanupStorageFixture(fixture); }
}
