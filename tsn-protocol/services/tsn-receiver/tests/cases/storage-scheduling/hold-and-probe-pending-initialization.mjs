import assert from "node:assert/strict";
import { writeVersion } from "./write-version.mjs";
export async function holdAndProbePendingInitialization(state, data) {
  data["scheduler-state"].row.version = 1;
  state.entered.resolve();
  await state.attemptNested.promise;
  const started = Date.now();
  await assert.rejects(state.fixture.readStore(state.second), /TSN_RECEIVER_LOCAL_STORE_BUSY/);
  await assert.rejects(state.fixture.mutateStore(state.second, writeVersion.bind(null, state, 99)), /TSN_RECEIVER_LOCAL_STORE_BUSY/);
  assert.ok(Date.now() - started < 2_000, "pending initialization must not make nested operations wait behind their own owner");
  assert.equal(state.initializationFinished, false);
  assert.equal(state.mutationCalls, 0);
  state.probed.resolve();
  await state.release.promise;
}
