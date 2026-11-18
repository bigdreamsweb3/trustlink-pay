import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";
import { manifestRow } from "./manifest-row.mjs";
export async function damagedRecordTest() {
  const fixture=await createStorageFixture();
  try {
    const work=fixture.localDb.collection("tsn_receiver_work");
    await work.doc("one").set({id:"one",kind:"SETTLEMENT",payload:{},stateVersion:1});
    const original=await manifestRow(fixture,"tsn_receiver_work","one"),file=path.join(fixture.file+".d",...original.relative.split("/"));
    await writeFile(file,"{damaged");
    const manifestBefore=await readFile(fixture.file,"utf8");
    await assert.rejects(work.get(),/LOCAL_RECORD_INVALID/);
    await assert.rejects(work.doc("two").set({id:"two",kind:"SETTLEMENT",payload:{}}),/LOCAL_RECORD_INVALID/);
    assert.equal(await readFile(file,"utf8"),"{damaged");assert.equal(await readFile(fixture.file,"utf8"),manifestBefore);
  }finally{await cleanupStorageFixture(fixture);}
}
