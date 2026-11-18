import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";
export async function damagedJournalTest() {
  const fixture=await createStorageFixture();
  try {
    const work=fixture.localDb.collection("tsn_receiver_work");await work.doc("one").set({id:"one",kind:"SETTLEMENT",payload:{},stateVersion:1});
    const before=await readFile(fixture.file,"utf8"),journal=path.join(fixture.file+".d","transaction.json");
    await writeFile(journal,"{damaged");
    await assert.rejects(work.get(),/LOCAL_JOURNAL_INVALID/);
    await assert.rejects(work.doc("two").set({id:"two",kind:"TIN_OPERATION",payload:{}}),/LOCAL_JOURNAL_INVALID/);
    assert.equal(await readFile(fixture.file,"utf8"),before);assert.equal(await readFile(journal,"utf8"),"{damaged");
    const next=JSON.parse(before);
    next.collections.tsn_receiver_work.ghost="epochs/unassigned/TIN_OPERATION/"+createHash("sha256").update("ghost").digest("hex")+".json";
    const missing={format:"TSN_RECEIVER_FILE_TRANSACTION",version:1,manifest:next,writes:[],deletes:[]};
    await writeFile(journal,JSON.stringify(missing));
    await assert.rejects(work.get(),/LOCAL_JOURNAL_INVALID/);
    assert.equal(await readFile(fixture.file,"utf8"),before);
  }finally{await cleanupStorageFixture(fixture);}
}
