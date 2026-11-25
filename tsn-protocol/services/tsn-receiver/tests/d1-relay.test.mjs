import {test,after} from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRelayFixture } from "./cases/node-relay/create-relay-fixture.mjs";
import { cleanupFixture } from "./cases/staged-funding/cleanup-fixture.mjs";
import { compileReceiverFixture } from "./support/compile-receiver-fixture.mjs";
import { testEncryptedRoundtrip } from "./cases/node-relay/test-encrypted-roundtrip.mjs";
import { testReplyMutations } from "./cases/node-relay/test-reply-mutations.mjs";
import { testNativeFences } from "./cases/node-relay/test-native-fences.mjs";
import { testExpiryAndValidation } from "./cases/node-relay/test-expiry-and-validation.mjs";
import { testHttpAuthentication } from "./cases/node-relay/test-http-authentication.mjs";
import { testWatchAndAdmission } from "./cases/node-relay/test-watch-and-admission.mjs";
import { sqliteBinding } from "../record-store-worker/tests/sqlite-binding.mjs";
import { handleStoreRequest } from "../record-store-worker/src/worker.mjs";
const fixture=await createRelayFixture();
await compileReceiverFixture(fixture.directory,["storage/record-store/database.ts","storage/record-store/command.ts"]);
const {RecordDb}=await import(pathToFileURL(path.join(fixture.directory,"storage/record-store/database.mjs")).href);
const {recordStoreCommand}=await import(pathToFileURL(path.join(fixture.directory,"storage/record-store/command.mjs")).href);
const binding=sqliteBinding(),token="synthetic-store-token-01234567890123456789";
let sequence=0;
fixture.persistenceFactory=()=>{
 const namespace="case-"+sequence++;
 const command=recordStoreCommand({TSN_RECORD_STORE_URL:"https://store.invalid",TSN_RECORD_STORE_TOKEN:token},async(url,options)=>handleStoreRequest(new Request(url,options),{DB:binding.DB,STORE_TOKEN:token}));
 const db=new RecordDb(command,namespace);
 binding.sqlite.prepare("INSERT INTO records(key,value) VALUES (?,?)").run(db.metadataKey,JSON.stringify({format:"TSN_RECEIVER_RECORD_STORE",version:1,revision:0,collections:{}}));
 return db;
};
after(async()=>{binding.sqlite.close();await cleanupFixture(fixture);});
for(const [name,body] of [["encrypted exact replies",testEncryptedRoundtrip],["mutation rejection",testReplyMutations],["original native generations",testNativeFences],["expiry and admission",testExpiryAndValidation],["Node authentication",testHttpAuthentication],["watch cleanup and admission",testWatchAndAdmission]])test("D1 relay: "+name,body.bind(null,fixture));
test("D1 transactions claim once, roll back invalid operations and never recreate lost records",async()=>{
 const db=fixture.persistenceFactory(),work=db.collection("work"),doc=work.doc("claim");await doc.create({status:"READY"});
 const claim=()=>db.runTransaction(async tx=>{const row=await tx.get(doc);if(row.get("status")!=="READY")return false;tx.update(doc,{status:"LEASED"});return true;});
 assert.equal((await Promise.all([claim(),claim()])).filter(Boolean).length,1);
 const raw=binding.sqlite.prepare("SELECT value FROM records WHERE key=?").get(db.metadataKey).value;
 await assert.rejects(db.runTransaction(async tx=>{tx.create(work.doc("other"),{value:1});tx.create(doc,{value:2});}),/ALREADY_EXISTS/);
 assert.equal((await work.doc("other").get()).exists,false);assert.equal(binding.sqlite.prepare("SELECT value FROM records WHERE key=?").get(db.metadataKey).value,raw);
 binding.sqlite.prepare("DELETE FROM records WHERE key=?").run(db.recordKey("work","claim"));
 await assert.rejects(doc.get(),/INDEXED_RECORD_MISSING/);
});
test("an uncertain D1 mutation response never automatically reruns the transaction",async()=>{
 const db=fixture.persistenceFactory(),original=db.command;let commits=0;
 db.command=async request=>{const result=await original(request);if(request.operation==="commit"){commits++;throw new Error("lost acknowledgement");}return result;};
 await assert.rejects(db.collection("work").doc("uncertain").create({status:"LEASED"}),/lost acknowledgement/);assert.equal(commits,1);
 db.command=original;assert.equal((await db.collection("work").doc("uncertain").get()).get("status"),"LEASED");
});

test("D1 indexed point reads use one request and omit unrelated rows",async()=>{
 const db=fixture.persistenceFactory(),collection=db.collection("point");await collection.doc("one").create({id:"one"});await collection.doc("other").create({private:"unrelated"});
 const original=db.command,calls=[];db.command=async request=>{calls.push(request);return original(request);};
 assert.equal((await collection.doc("one").get()).get("id"),"one");assert.equal(calls.length,1);assert.equal(calls[0].keys.length,2);assert.equal(calls[0].keys.includes(db.recordKey("point","other")),false);
});

test("identical sets, unchanged merges and absent deletes perform no D1 mutations", async () => {
 const db=fixture.persistenceFactory(),collection=db.collection("no-op"),doc=collection.doc("one");
 await doc.create({status:"READY",version:1});
 const original=db.command,calls=[];
 db.command=async request=>{calls.push(request);return original(request);};
 const before=binding.sqlite.prepare("SELECT total_changes() AS n").get().n;
 const raw=binding.sqlite.prepare("SELECT value FROM records WHERE key=?").get(db.metadataKey).value;
 await doc.set({status:"READY",version:1});
 await doc.set({version:1},{merge:true});
 await collection.doc("absent").delete();
 await db.runTransaction(async tx=>{tx.create(collection.doc("temporary"),{value:1});tx.delete(collection.doc("temporary"));});
 assert.equal(calls.filter(request=>request.operation==="commit").length,0);
 assert.equal(binding.sqlite.prepare("SELECT total_changes() AS n").get().n,before);
 assert.equal(binding.sqlite.prepare("SELECT value FROM records WHERE key=?").get(db.metadataKey).value,raw);
 await assert.rejects(doc.create({status:"READY",version:1}),/ALREADY_EXISTS/);
});

test("an unchanged transaction still retries when its observed metadata generation advances", async () => {
 const db=fixture.persistenceFactory(),doc=db.collection("no-op-race").doc("one");
 await doc.create({version:1});
 let attempts=0;
 const observed=await db.runTransaction(async tx=>{
  attempts++;
  const value=(await tx.get(doc)).get("version");
  tx.set(doc,{version:value});
  if(attempts===1)await doc.set({version:2});
  return value;
 });
 assert.equal(observed,2);assert.equal(attempts,2);
});

test("the Cranker wake cursor is a read-only point read with no work or credential projection", async () => {
 await compileReceiverFixture(fixture.directory,["http/api/cranker/wake/GET.ts"]);
 const {GET}=await import(pathToFileURL(path.join(fixture.directory,"http/api/cranker/wake/GET.mjs")).href);
 const db=fixture.persistenceFactory(),control=db.collection("tsn_receiver_control").doc("cranker");
 const nonce="12345678-1234-1234-1234-123456789abc";
 await control.set({nonce,kind:"VERIFIED",private:"synthetic restricted value"});
 const before=binding.sqlite.prepare("SELECT total_changes() AS n").get().n;
 const response=await GET({control,NextResponse:{json:(body,options)=>({body,options})}});
 assert.deepEqual(response.body,{cursor:nonce});
 assert.equal(binding.sqlite.prepare("SELECT total_changes() AS n").get().n,before);
 await control.delete();
 assert.deepEqual((await GET({control,NextResponse:{json:body=>body}})),{cursor:"empty"});
});
