import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { createQueryFixture } from "./create-query-fixture.mjs";
import { decryptFixture } from "./decrypt-fixture.mjs";

export async function coordinationReadsOneSnapshot() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "receiver-coordination-page-"));
  try {
    await compileReceiverFixture(directory, ["state/private-coordination/coordination-inventory.ts", "work/projectWorkForNode.ts"]);
    const { coordinationInventory } = await import(pathToFileURL(path.join(directory, "state/private-coordination/coordination-inventory.mjs")).href);
    const { projectWorkForNode } = await import(pathToFileURL(path.join(directory, "work/projectWorkForNode.mjs")).href);
    const rows = [], expectedFirst = [], expectedSecond = [];
    let encryptedCount = 0;
    for (let index = 0; index < 205; index += 1) {
      const id = "work-" + String(index).padStart(3, "0");
      const kind = index < 200 ? "AUTHORIZED_FUNDING" : ["SETTLEMENT", "TCAP_EPOCH_ACCOUNTING", "TIN_OPERATION", "TCAP_FUNDING_POOL", "SETTLEMENT"][index - 200];
      const row = { id, kind, status: index % 2 ? "CONFIRMED" : "RECEIVED", stateVersion: index + 1, payload: { retained: id }, verification: { retained: true } };
      let expected = structuredClone(row);
      if (kind === "AUTHORIZED_FUNDING" && index % 3 === 0) {
        const plaintext = { intentId: id, privateFields: { complete: true }, witness: ["synthetic", String(index)] };
        row.payload = { nodeEncryptedPayload: { version: 1, plaintext } };
        expected = { ...row, payload: plaintext };
        encryptedCount += 1;
      }
      rows.push(row);
      if (index < 200) expectedFirst.push(expected);
      else if (kind === "SETTLEMENT" || kind === "TCAP_EPOCH_ACCOUNTING") expectedSecond.push(expected);
    }
    const before = structuredClone(rows);
    const context = createQueryFixture(rows);
    context.decryptions = 0;
    const dependencies = {
      workCollection: context.collection,
      projectNodeWork: projectWorkForNode.bind(null, { decryptPayloadForNode: decryptFixture.bind(null, context) }),
      readNodeWork: assert.fail.bind(null, "retired repeated-read port must never be called"),
    };
    const first = await coordinationInventory(dependencies);
    assert.deepEqual(first, { work: expectedFirst, nextCursor: "work-199" });
    assert.equal(context.reads, 1, "two hundred funding rows must share one query snapshot");
    assert.equal(context.decryptions, encryptedCount);
    assert.equal(context.orders, 1);
    assert.equal(context.filters, 0);
    const second = await coordinationInventory(dependencies, first.nextCursor);
    assert.deepEqual(second, { work: expectedSecond, nextCursor: null });
    assert.equal(context.reads, 2, "the next page adds exactly one query");
    assert.equal(context.decryptions, encryptedCount, "nonfunding rows must not be decrypted");
    assert.equal(context.filters, 1);
    assert.deepEqual(rows, before, "projection must not replace encrypted persisted rows");
    for (const cursor of ["x".repeat(201), "../cursor", "cursor\u0000value", "cursor\nline"]) {
      await assert.rejects(coordinationInventory(dependencies, cursor), /PRIVATE_CREDIT_CURSOR_INVALID/);
      assert.equal(context.reads, 2, "invalid cursors fail before storage access");
    }
    context.rows = [{ id: "work-999", kind: "AUTHORIZED_FUNDING", payload: { nodeEncryptedPayload: "invalid" } }];
    await assert.rejects(coordinationInventory(dependencies, "work-998"), /NODE_PAYLOAD_ENVELOPE_INVALID/);
    assert.equal(context.reads, 3, "projection errors must not trigger another read or skip the row");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
