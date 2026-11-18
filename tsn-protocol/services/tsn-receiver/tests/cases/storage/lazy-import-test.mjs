import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";
export async function lazyImportTest() {
  const raw=JSON.stringify({tsn_receiver_work:{one:{id:"one",kind:"TIN_OPERATION",payload:{},stateVersion:1}}});
  const fixture=await createStorageFixture(raw,false);
  try {
    assert.equal(await readFile(fixture.file,"utf8"),raw);assert.equal(fixture.localDb.context.initialized,false);
    await assert.rejects(access(fixture.file+".d"),{code:"ENOENT"});
    await assert.rejects(access(fixture.file+".lock"),{code:"ENOENT"});
    await assert.rejects(fixture.localDb.collection("tsn_receiver_work").doc("one").get(),/TSN_RECEIVER_LOCAL_MANIFEST_INVALID/);
    assert.equal(await readFile(fixture.file,"utf8"),raw);
    await assert.rejects(access(fixture.file+".d"),{code:"ENOENT"});
    await assert.rejects(access(fixture.file+".lock"),{code:"ENOENT"});
  }finally{await cleanupStorageFixture(fixture);}
}
