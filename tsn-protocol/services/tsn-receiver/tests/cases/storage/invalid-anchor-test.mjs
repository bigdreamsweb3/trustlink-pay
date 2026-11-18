import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";

export async function invalidAnchorTest() {
  const cases = [
    { raw: JSON.stringify({ tsn_receiver_work: { one: { id: "one", kind: "SETTLEMENT", payload: {}, stateVersion: 3 } } }, null, 2), error: /TSN_RECEIVER_LOCAL_MANIFEST_INVALID/ },
    { raw: "{}", error: /TSN_RECEIVER_LOCAL_MANIFEST_INVALID/ },
    { raw: "[]", error: /TSN_RECEIVER_LOCAL_MANIFEST_INVALID/ },
    { raw: "null", error: /TSN_RECEIVER_LOCAL_MANIFEST_INVALID/ },
    { raw: "7", error: /TSN_RECEIVER_LOCAL_MANIFEST_INVALID/ },
    { raw: "{damaged", error: /TSN_RECEIVER_LOCAL_STORE_INVALID/ },
  ];
  const fixture = await createStorageFixture(cases[0].raw, false);
  try {
    for (const { raw, error } of cases) {
      await writeFile(fixture.file, raw);
      const db = new fixture.LocalDb(fixture.createStoreContext({ file: fixture.file }));
      const work = db.collection("tsn_receiver_work");
      await assert.rejects(work.get(), error);
      await assert.rejects(work.doc("replacement").set({ id: "replacement", kind: "SETTLEMENT", payload: {} }), error);
      assert.equal(await readFile(fixture.file, "utf8"), raw);
      await assert.rejects(access(fixture.file + ".d"), { code: "ENOENT" });
      await assert.rejects(access(fixture.file + ".lock"), { code: "ENOENT" });
    }
  } finally { await cleanupStorageFixture(fixture); }
}
