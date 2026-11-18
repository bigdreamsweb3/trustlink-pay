import assert from "node:assert/strict";
import { writeVersion } from "./write-version.mjs";
export async function probeNestedOperations(state, data) {
  data["scheduler-state"].row.version = 1;
  const started = Date.now();
  await assert.rejects(state.duplicate.readStore(state.second), /TSN_RECEIVER_LOCAL_STORE_BUSY/);
  await assert.rejects(state.duplicate.mutateStore(state.second, writeVersion.bind(null, state, 99)), /TSN_RECEIVER_LOCAL_STORE_BUSY/);
  assert.ok(Date.now() - started < 2_000, "reentrant operations must fail promptly rather than wait behind themselves");
  assert.equal(state.mutationCalls, 0);
  assert.equal(data["scheduler-state"].row.version, 1);
}
