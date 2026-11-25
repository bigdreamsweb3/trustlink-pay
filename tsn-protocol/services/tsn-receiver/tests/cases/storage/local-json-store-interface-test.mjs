import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createStorageFixture } from "./create-storage-fixture.mjs";
import { cleanupStorageFixture } from "./cleanup-storage-fixture.mjs";
export async function localFirestoreInterfaceTest() {
  const fixture=await createStorageFixture();
  try {
    const localDb=fixture.localDb,secondWorkerDb=new fixture.LocalDb(fixture.createStoreContext({file:fixture.file}));
    const challenges=localDb.collection("challenges"),reference=challenges.doc("used-challenge");
    await reference.create({used:true,expiresAt:"2026-10-01T00:00:00.000Z"});
    await assert.rejects(reference.create({used:false}),/ALREADY_EXISTS/);
    const used=await challenges.where("used","==",true).get();assert.equal(used.docs.length,1);assert.equal(used.docs[0].get("used"),true);
    const expired=await challenges.where("expiresAt","<=","2026-10-02T00:00:00.000Z").get();assert.equal(expired.docs.length,1);await expired.docs[0].ref.delete();
    assert.equal((await challenges.get()).docs.length,0);
    const persisted=JSON.parse(await readFile(fixture.file,"utf8"));assert.deepEqual(persisted.collections.challenges,{});
    const rateLimit=challenges.doc("rate-limit");
    const batch=localDb.batch();batch.set(rateLimit,{count:1});batch.set(rateLimit,{updated:true},{merge:true});await batch.commit();
    assert.deepEqual((await rateLimit.get()).data(),{count:1,updated:true});
    // This interface/persistence fixture bounds concurrency; scheduler tests cover overload cancellation.
    for(let wave=0;wave<5;wave+=1){
      const creations=[];
      for(let offset=0;offset<4;offset+=1){const index=wave*4+offset,worker=index%2===0?localDb:secondWorkerDb;creations.push(worker.collection("parallel").doc(String(index)).create({index}));}
      await Promise.all(creations);
    }
    assert.equal((await localDb.collection("parallel").get()).docs.length,20);
    const bucket=localDb.collection("node-state").doc("state-bucket"),item=bucket.collection("items").doc("item-a"),writes=localDb.batch();
    writes.set(bucket,{key:"state",value:"ready"});writes.set(item,{field:"item-a",value:"one"});await writes.commit();
    assert.equal((await bucket.get()).get("value"),"ready");assert.equal((await item.get()).get("value"),"one");
    const cleanup=localDb.batch();cleanup.delete(item);cleanup.delete(bucket);await cleanup.commit();
    assert.equal((await bucket.get()).exists,false);assert.equal((await item.get()).exists,false);
  }finally{await cleanupStorageFixture(fixture);}
}
