import test from "node:test";
import assert from "node:assert/strict";
import { handleStoreRequest } from "../src/worker.mjs";
import { sqliteBinding } from "./sqlite-binding.mjs";
const token="synthetic-private-service-token-0123456789";
const initial=JSON.stringify({format:"TSN_RECEIVER_RECORD_STORE",version:1,revision:0,collections:{}});
function request(body,credential=token){return new Request("https://store.invalid",{method:"POST",headers:{authorization:"Bearer "+credential},body:JSON.stringify(body)});}
test("D1 guards authenticate, reject malformed keys and fail closed for a missing store",async()=>{
 const {DB,sqlite}=sqliteBinding();try{
  assert.equal((await handleStoreRequest(request({operation:"read",keys:["{test}:metadata"]},"wrong"),{DB,STORE_TOKEN:token})).status,401);
  assert.equal((await handleStoreRequest(request({operation:"read",keys:["outside"]}),{DB,STORE_TOKEN:token})).status,400);
  const response=await handleStoreRequest(request({operation:"commit",metadataKey:"{test}:metadata",expected:initial,metadata:initial.replace('"revision":0','"revision":1'),records:[{key:"{test}:record:"+"a".repeat(64),value:'{"status":"LEASED"}'}]}),{DB,STORE_TOKEN:token});
  assert.deepEqual(await response.json(),{result:false});assert.equal(sqlite.prepare("SELECT count(*) AS n FROM records").get().n,0);
 }finally{sqlite.close();}
});
test("D1 atomic batch publishes exact records and rejects stale generations without partial changes",async()=>{
 const {DB,sqlite}=sqliteBinding();try{
  sqlite.prepare("INSERT INTO records(key,value) VALUES (?,?)").run("{test}:metadata",initial);
  const key="{test}:record:"+"a".repeat(64),next=initial.replace('"revision":0','"revision":1');
  const body={operation:"commit",metadataKey:"{test}:metadata",expected:initial,metadata:next,records:[{key,value:'{"status":"LEASED","version":2}'}]};
  assert.deepEqual(await (await handleStoreRequest(request(body),{DB,STORE_TOKEN:token})).json(),{result:true});
  const stale={...body,records:[{key,value:'{"status":"FORGED"}'}]};
  assert.deepEqual(await (await handleStoreRequest(request(stale),{DB,STORE_TOKEN:token})).json(),{result:false});
  assert.equal(sqlite.prepare("SELECT value FROM records WHERE key=?").get(key).value,body.records[0].value);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM commit_guard").get().n,0);
  const deleted={...body,expected:next,metadata:next.replace('"revision":1','"revision":2'),records:[{key,value:null}]};
  assert.deepEqual(await (await handleStoreRequest(request(deleted),{DB,STORE_TOKEN:token})).json(),{result:true});assert.equal(sqlite.prepare("SELECT value FROM records WHERE key=?").get(key),undefined);
 }finally{sqlite.close();}
});
test("one hundred deletions stay atomic within the D1 Free binding limits",async()=>{
 const {DB,sqlite}=sqliteBinding();try{
  sqlite.prepare("INSERT INTO records(key,value) VALUES (?,?)").run("{test}:metadata",initial);
  const records=Array.from({length:100},(_,i)=>({key:"{test}:record:"+i.toString(16).padStart(64,"0"),value:null}));
  for(const record of records)sqlite.prepare("INSERT INTO records(key,value) VALUES (?,?)").run(record.key,'{"status":"EXPIRED"}');
  const response=await handleStoreRequest(request({operation:"commit",metadataKey:"{test}:metadata",expected:initial,metadata:initial.replace('"revision":0','"revision":1'),records}),{DB,STORE_TOKEN:token});
  assert.deepEqual(await response.json(),{result:true});assert.equal(sqlite.prepare("SELECT count(*) AS n FROM records").get().n,1);
 }finally{sqlite.close();}
});
