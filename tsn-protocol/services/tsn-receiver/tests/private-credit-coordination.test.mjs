import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import test from "node:test";
import ts from "typescript";
test("sealed pools and epochs paginate, defer and serialize across concurrent Nodes",async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"tsn-private-coordination-"));
  const previous=process.env.TSN_RECEIVER_LOCAL_FILE;
  process.env.TSN_RECEIVER_LOCAL_FILE=path.join(directory,"store.json");
  try{
    for(const name of ["local-firestore","work-contract","settlement-retry","native-work-retry","store","private-credit-coordination"]){
      const source=await readFile(new URL("../lib/"+name+".ts",import.meta.url),"utf8");
      const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
        .replace(/from "\.\/([^".]+)"/g,'from "./$1.mjs"').replace('from "firebase-admin/firestore"','from "./firestore-stub.mjs"');
      await writeFile(path.join(directory,name+".mjs"),compiled);
    }
    for(const [name,source] of Object.entries({
      firebase:'import {localDb} from "./local-firestore.mjs";export const db=localDb;export const workCollection=db.collection("tsn_receiver_work");',
      "firestore-stub":"export const FieldPath={};export const Timestamp={};",
      "node-envelope":"export const decryptPayloadForNode=x=>x;export const encryptPayloadForNode=x=>x;",
      "node-verification":"export const assertNodeVerificationAttestation=()=>{};",
      "node-wake":"export const wakeTsnNode=async()=>{};",
      "cranker-wake":"export const publishCrankerWake=async()=>{};"
    }))await writeFile(path.join(directory,name+".mjs"),source);
    const load=n=>import(pathToFileURL(path.join(directory,n+".mjs")).href);
    const {workCollection,db}=await load("firebase"),{createReceivedWork}=await load("work-contract");
    const {coordinationInventory,deferPrivateCredit,enqueueCoordination}=await load("private-credit-coordination");
    const {leaseForNode}=await load("store"),{nativeWorkRetryPatch}=await load("native-work-retry");
    const poolId="tcap-pool-"+"a".repeat(64),epochId="tcap-epoch-"+"b".repeat(64);
    const pool={id:poolId,kind:"TCAP_FUNDING_POOL",payload:{assetEntry:"synthetic-asset",root:"a".repeat(64)}};
    await enqueueCoordination(pool);await enqueueCoordination(pool);
    await assert.rejects(enqueueCoordination({...pool,payload:{...pool.payload,root:"b".repeat(64)}}),/IDEMPOTENCY/);
    // More than a full inventory page and fifty deferred works cannot starve fresh work.
    await db.runTransaction(async tx=>{
      for(let i=0;i<210;i++){
        const work=createReceivedWork({id:"a"+String(i).padStart(4,"0"),kind:"TCAP_FUNDING_POOL",payload:{}});
        tx.create(workCollection.doc(work.id),{...work,deferredUntil:new Date(Date.now()+60000).toISOString()});
      }
      const epoch=createReceivedWork({id:epochId,kind:"TCAP_EPOCH_ACCOUNTING",payload:{}});
      tx.create(workCollection.doc(epoch.id),epoch);
    });
    const first=await coordinationInventory(),second=await coordinationInventory(first.nextCursor);
    assert.equal(first.work.length,200);assert.equal(second.work.length,12);assert.equal(second.nextCursor,null);
    const claims=await Promise.all([leaseForNode("A",["TCAP_EPOCH_ACCOUNTING"]),leaseForNode("B",["TCAP_EPOCH_ACCOUNTING"])]);
    const epoch=claims.find(Boolean);assert.equal(claims.filter(Boolean).length,1);
    await deferPrivateCredit({id:epoch.id,owner:epoch.nodeLease.owner,expectedVersion:epoch.stateVersion,seconds:1});
    const deferred=(await workCollection.doc(epoch.id).get()).data();
    assert.equal(deferred.status,"RECEIVED");assert.equal(deferred.nodeLease,null);
    await assert.rejects(deferPrivateCredit({id:epoch.id,owner:"wrong",expectedVersion:epoch.stateVersion,seconds:1}),/LEASE_INVALID/);
    const expiry=new Date(Date.now()+60000).toISOString();
    const leased={...deferred,status:"CRANKER_LEASED",crankerLease:{owner:"payer",expiresAt:expiry}};
    assert.equal(nativeWorkRetryPatch(leased,null,leased.stateVersion,"payer","test","TCAP_EPOCH_ALREADY_ACCOUNTED").status,"RECEIVED");
    assert.throws(()=>nativeWorkRetryPatch({...leased,result:{signature:"uncertain"}},null,leased.stateVersion,"payer","test","TCAP_EPOCH_ALREADY_ACCOUNTED"),/EXECUTION_STATE/);
    const funding={...createReceivedWork({id:"funding",kind:"AUTHORIZED_FUNDING",payload:{}}),status:"CONFIRMED"};
    const credit=createReceivedWork({id:"credit",kind:"SETTLEMENT",payload:{intentId:"funding"}});
    await db.runTransaction(async tx=>{
      tx.create(workCollection.doc(funding.id),funding);tx.create(workCollection.doc(credit.id),credit);
      tx.update(workCollection.doc(epoch.id),{status:"FAILED",result:{signature:"uncertain"}});
    });
    assert.equal(await leaseForNode("C",["SETTLEMENT"]),null,"uncertain signed accounting holds global root lock");
    await db.runTransaction(async tx=>tx.update(workCollection.doc(epoch.id),{status:"CONFIRMED"}));
    assert.equal((await leaseForNode("C",["SETTLEMENT"])).id,"credit");
  }finally{
    if(previous===undefined)delete process.env.TSN_RECEIVER_LOCAL_FILE;else process.env.TSN_RECEIVER_LOCAL_FILE=previous;
    await rm(directory,{recursive:true,force:true});
  }
});
