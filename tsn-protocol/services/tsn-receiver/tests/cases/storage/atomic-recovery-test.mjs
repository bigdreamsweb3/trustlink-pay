import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";
import { filesystemPort } from "./filesystem-port.mjs";
import { resetFilesystemState } from "./reset-filesystem-state.mjs";
import { writeAtomicPair } from "./write-atomic-pair.mjs";
export async function atomicRecoveryTest() {
  const fixture=await createStorageFixture();
  const state={file:fixture.file,lockFile:fixture.file+".lock"};resetFilesystemState(state);
  try {
    const context=fixture.createStoreContext({file:fixture.file,fs:filesystemPort(state)}),db=new fixture.LocalDb(context);await context.ready;
    const collection=db.collection("tsn_receiver_work");
    const initial=db.batch();initial.set(collection.doc("funding"),{id:"funding",kind:"AUTHORIZED_FUNDING",payload:{},stateVersion:1});initial.set(collection.doc("settlement"),{id:"settlement",kind:"SETTLEMENT",payload:{},stateVersion:1});await initial.commit();
    const before=await readFile(fixture.file,"utf8");
    resetFilesystemState(state);state.failJournalRename=true;
    await assert.rejects(db.runTransaction(writeAtomicPair.bind(null,collection)),{code:"EIO"});
    assert.equal(await readFile(fixture.file,"utf8"),before);
    await assert.rejects(access(path.join(fixture.file+".d","transaction.json")),{code:"ENOENT"});
    resetFilesystemState(state);
    for(const row of (await collection.get()).docs)assert.equal(row.get("stateVersion"),1);
    resetFilesystemState(state);state.failRecordRenameAt=2;
    await assert.rejects(db.runTransaction(writeAtomicPair.bind(null,collection)),/RECOVERY_REQUIRED/);
    assert.equal(await readFile(fixture.file,"utf8"),before);await access(path.join(fixture.file+".d","transaction.json"));
    resetFilesystemState(state);
    const recovered=await collection.get();
    assert.equal(recovered.docs.length,2);
    for(const row of recovered.docs)assert.equal(row.get("stateVersion"),2);
    await assert.rejects(access(path.join(fixture.file+".d","transaction.json")),{code:"ENOENT"});
    resetFilesystemState(state);state.failManifestRename=true;
    const batch=db.batch();batch.set(collection.doc("third"),{id:"third",kind:"TIN_OPERATION",payload:{},stateVersion:1});
    await assert.rejects(batch.commit(),/RECOVERY_REQUIRED/);
    resetFilesystemState(state);
    const restarted=new fixture.LocalDb(fixture.createStoreContext({file:fixture.file}));await restarted.context.ready;
    assert.equal((await restarted.collection("tsn_receiver_work").doc("third").get()).get("stateVersion"),1);
    await assert.rejects(access(path.join(fixture.file+".d","transaction.json")),{code:"ENOENT"});
  }finally{await cleanupStorageFixture(fixture);}
}
