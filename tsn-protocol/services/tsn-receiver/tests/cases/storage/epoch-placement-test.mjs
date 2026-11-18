import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";
import { manifestRow } from "./manifest-row.mjs";
export async function epochPlacementTest() {
  const fixture=await createStorageFixture();
  try {
    const collection=fixture.localDb.collection("tsn_receiver_work");
    const work={id:"settlement-one",kind:"SETTLEMENT",payload:{intentId:"funding"},status:"RECEIVED",stateVersion:1};
    await collection.doc(work.id).set(work);
    const initial=await manifestRow(fixture,"tsn_receiver_work",work.id);
    assert.match(initial.relative,/^epochs\/unassigned\/SETTLEMENT\//);
    const verified={...work,status:"VERIFIED",stateVersion:2,verification:{payloadDelta:{addedFields:{tcapCreditTransition:{accountingEpoch:"SyntheticAccountA"}},changedFields:{},removedFields:[]}}};
    await collection.doc(work.id).set(verified);
    const placed=await manifestRow(fixture,"tsn_receiver_work",work.id);
    assert.match(placed.relative,/^epochs\/SyntheticAccountA--[a-f0-9]{16}\/SETTLEMENT\//);assert.deepEqual(placed.row,verified);
    await assert.rejects(collection.doc(work.id).set({...verified,authorization:{transition:{accountingEpoch:"ConflictingAccount"}}}),/LOCAL_EPOCH_CONFLICT/);
    assert.deepEqual((await collection.doc(work.id).get()).data(),verified);
    await assert.rejects(access(path.join(fixture.file+".d",...initial.relative.split("/"))),{code:"ENOENT"});
    await collection.doc("epoch-one").set({id:"epoch-one",kind:"TCAP_EPOCH_ACCOUNTING",payload:{accountingEpoch:"SyntheticAccountA"}});
    assert.equal((await manifestRow(fixture,"tsn_receiver_work","epoch-one")).relative.split("/")[1],placed.relative.split("/")[1]);
    await collection.doc("funding").set({id:"funding",kind:"AUTHORIZED_FUNDING",payload:{paymentId:"funding"}});
    await collection.doc("tin").set({id:"tin",kind:"TIN_OPERATION",payload:{}});
    assert.match((await manifestRow(fixture,"tsn_receiver_work","funding")).relative,/^epochs\/unassigned\/AUTHORIZED_FUNDING\//);
    assert.match((await manifestRow(fixture,"tsn_receiver_work","tin")).relative,/^epochs\/unassigned\/TIN_OPERATION\//);
    await collection.doc("legacy").set({id:"legacy",kind:"SETTLEMENT",payload:{},verification:{verifiedPayload:{tcapCreditTransition:{accountingEpoch:"LegacyAccount"}}}});
    assert.match((await manifestRow(fixture,"tsn_receiver_work","legacy")).relative,/^epochs\/LegacyAccount--/);
    await collection.doc("authorized").set({id:"authorized",kind:"SETTLEMENT",payload:{},authorization:{transition:{accountingEpoch:"AuthorizedAccount"}}});
    assert.match((await manifestRow(fixture,"tsn_receiver_work","authorized")).relative,/^epochs\/AuthorizedAccount--/);
  }finally{await cleanupStorageFixture(fixture);}
}
