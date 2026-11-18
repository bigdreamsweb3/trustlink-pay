import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";
import { transactionScan } from "./transaction-scan.mjs";
import { transactionOwnWrites } from "./transaction-own-writes.mjs";
import { runTransactionExclusion } from "./run-transaction-exclusion.mjs";
import { rejectedTransaction } from "./rejected-transaction.mjs";
import { snapshotIdentifiers } from "./snapshot-identifiers.mjs";
export async function transactionTest() {
  const fixture=await createStorageFixture();
  try {
    const db=fixture.localDb, other=new fixture.LocalDb(fixture.createStoreContext({file:fixture.file}));
    await other.context.ready;
    const collection=db.collection("work"),failed=collection.doc("epoch-010"),batch=db.batch();
    for(let index=0;index<205;index+=1){const id=`epoch-${String(index).padStart(3,"0")}`;batch.set(collection.doc(id),{id,kind:"TCAP_EPOCH_ACCOUNTING",status:"FAILED",stateVersion:167,payload:{assetEntry:"asset",root:"root"},result:{reason:"SIGNING_UNAVAILABLE"}});}
    batch.set(collection.doc("other-kind"),{id:"other-kind",kind:"TIN_OPERATION"});await batch.commit();
    assert.equal(await db.runTransaction(transactionScan.bind(null,collection,failed)),205);
    assert.equal((await failed.get()).get("stateVersion"),168);
    await assert.rejects(access(fixture.file+".lock"),{code:"ENOENT"});
    const query=collection.where("kind","==","TCAP_EPOCH_ACCOUNTING").where("id",">=","epoch-002").where("id","<","epoch-008").where("id","!=","epoch-004").orderBy("__name__","desc").limit(4);
    const ordinary=await query.get(),result=await db.runTransaction(transactionOwnWrites.bind(null,collection,query));
    assert.deepEqual(snapshotIdentifiers(result.page),snapshotIdentifiers(ordinary));
    assert.deepEqual(snapshotIdentifiers(result.page),["epoch-007","epoch-006","epoch-005","epoch-003"]);
    assert.deepEqual(snapshotIdentifiers(result.next),snapshotIdentifiers(await query.startAfter(ordinary.docs.at(-1)).get()));
    assert.deepEqual(snapshotIdentifiers(result.ownWrites),["epoch-099"]);
    const state=await runTransactionExclusion(db,other,collection,failed);
    assert.equal(state.finished,true);assert.equal((await failed.get()).get("audit"),"snapshot-checked");
    assert.equal((await collection.doc("epoch-new").get()).get("status"),"CRANKER_LEASED");
    const before=await readFile(fixture.file,"utf8"),recordBefore=JSON.stringify((await failed.get()).data());
    await assert.rejects(db.runTransaction(rejectedTransaction.bind(null,collection,failed)),/LOCAL_QUERY_OPERATOR_UNSUPPORTED: in/);
    assert.equal(await readFile(fixture.file,"utf8"),before);assert.equal(JSON.stringify((await failed.get()).data()),recordBefore);
    await assert.rejects(access(fixture.file+".lock"),{code:"ENOENT"});
  }finally{await cleanupStorageFixture(fixture);}
}
