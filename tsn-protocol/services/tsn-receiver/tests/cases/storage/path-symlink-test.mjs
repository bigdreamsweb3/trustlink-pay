import assert from "node:assert/strict";
import { mkdir, readdir, symlink } from "node:fs/promises";
import path from "node:path";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";
export async function pathSymlinkTest() {
  const fixture=await createStorageFixture();
  try {
    const outside=path.join(fixture.directory,"outside-store");
    await mkdir(outside);await mkdir(path.join(fixture.file+".d","epochs"),{recursive:true});
    await symlink(outside,path.join(fixture.file+".d","epochs","unassigned"),"junction");
    await assert.rejects(fixture.localDb.collection("tsn_receiver_work").doc("one").set({id:"one",kind:"TIN_OPERATION",payload:{},stateVersion:1}),/LOCAL_(?:JOURNAL_INVALID|RECORD_PATH_INVALID)/);
    assert.deepEqual(await readdir(outside),[]);
  }finally{await cleanupStorageFixture(fixture);}
}
