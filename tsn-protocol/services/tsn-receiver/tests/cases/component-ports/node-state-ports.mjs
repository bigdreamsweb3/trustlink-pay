import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { consumedValue } from "./consumed-value.mjs";

/** Supply only an isolated collection/database, and verify one-time consumption remains atomic. */
export async function nodeStatePorts() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "receiver-state-ports-"));
  const previous = process.env.TSN_RECEIVER_LOCAL_FILE;
  process.env.TSN_RECEIVER_LOCAL_FILE = path.join(directory, "store.json");
  try {
    await compileReceiverFixture(directory, ["local-json-store.ts", "state/node-key-value/execute-state-operation.ts"]);
    const { localDb } = await import(pathToFileURL(path.join(directory, "local-json-store.mjs")).href);
    const { executeStateOperation } = await import(pathToFileURL(path.join(directory, "state/node-key-value/execute-state-operation.mjs")).href);
    const dependencies = { database: localDb, root: localDb.collection("test_state") };
    assert.deepEqual(await executeStateOperation(dependencies, { operation: "set", key: "bucket", value: "value" }), { ok: true });
    assert.deepEqual(await executeStateOperation(dependencies, { operation: "get", key: "bucket" }), { value: "value" });
    await executeStateOperation(dependencies, { operation: "hset", key: "bucket", mapping: { left: "L", right: "R" } });
    assert.deepEqual(await executeStateOperation(dependencies, { operation: "hgetall", key: "bucket" }), { values: { left: "L", right: "R" } });
    const input = { operation: "consume_once", key: "once", field: "field", value: "consumed" };
    const first = executeStateOperation(dependencies, input), second = executeStateOperation(dependencies, input);
    assert.deepEqual((await Promise.all([first, second])).map(consumedValue).sort(), [false, true]);
    assert.deepEqual(await executeStateOperation(dependencies, { operation: "hget", key: "once", field: "field" }), { value: "consumed" });
    await executeStateOperation(dependencies, { operation: "delete", key: "once", keys: ["once", "bucket"] });
    assert.deepEqual(await executeStateOperation(dependencies, { operation: "get", key: "bucket" }), { value: null });
    assert.deepEqual(await executeStateOperation(dependencies, { operation: "hgetall", key: "once" }), { values: {} });
  } finally {
    if (previous === undefined) delete process.env.TSN_RECEIVER_LOCAL_FILE;
    else process.env.TSN_RECEIVER_LOCAL_FILE = previous;
    await rm(directory, { recursive: true, force: true });
  }
}
