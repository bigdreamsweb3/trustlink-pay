import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";
import { manifestRow } from "./manifest-row.mjs";
export async function pathSafetyTest() {
  const fixture=await createStorageFixture();
  try {
    const work=fixture.localDb.collection("tsn_receiver_work"),ids=["../escape","CON","foo","Foo","a\\b","🧪","__proto__"];
    const batch=fixture.localDb.batch();
    for(const id of ids)batch.set(work.doc(id),{id,kind:"SETTLEMENT",payload:{},stateVersion:1});await batch.commit();
    const paths=new Set();
    for(const id of ids){const stored=await manifestRow(fixture,"tsn_receiver_work",id);assert.match(stored.relative,/^epochs\/unassigned\/SETTLEMENT\/[a-f0-9]{64}\.json$/);paths.add(stored.relative.toLowerCase());assert.equal(stored.row.id,id);}
    assert.equal(paths.size,ids.length);
    await work.doc("reserved-kind").set({id:"reserved-kind",kind:"CON",payload:{}});
    assert.match((await manifestRow(fixture,"tsn_receiver_work","reserved-kind")).relative,/^epochs\/unassigned\/CON--[a-f0-9]{16}\//);
    await work.doc("long-kind").set({id:"long-kind",kind:"A".repeat(400),payload:{}});
    assert.ok((await manifestRow(fixture,"tsn_receiver_work","long-kind")).relative.split("/")[2].length<100);
    await work.doc("epoch-upper").set({id:"epoch-upper",kind:"TCAP_EPOCH_ACCOUNTING",payload:{accountingEpoch:"AbC"}});
    await work.doc("epoch-lower").set({id:"epoch-lower",kind:"TCAP_EPOCH_ACCOUNTING",payload:{accountingEpoch:"abc"}});
    assert.notEqual((await manifestRow(fixture,"tsn_receiver_work","epoch-upper")).relative.toLowerCase(),(await manifestRow(fixture,"tsn_receiver_work","epoch-lower")).relative.toLowerCase());
    const original=JSON.parse(await readFile(fixture.file,"utf8")),corrupt=structuredClone(original);
    corrupt.collections.tsn_receiver_work.CON="../../outside.json";await writeFile(fixture.file,JSON.stringify(corrupt));
    await assert.rejects(work.get(),/RECORD_PATH_INVALID/);
    assert.equal(await readFile(fixture.file,"utf8"),JSON.stringify(corrupt));
  }finally{await cleanupStorageFixture(fixture);}
}
