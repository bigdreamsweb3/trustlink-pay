import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { PublicKey } from "@solana/web3.js";

const hash=x=>createHash("sha256").update(x).digest();
const b58=buffer=>{let n=BigInt(`0x${buffer.toString("hex")}`),out=""; while(n){out="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Number(n%58n)]+out;n/=58n;} for(const b of buffer){if(b!==0)break;out="1"+out;}return out;};
const uint=(n,size)=>{const b=Buffer.alloc(size);let v=BigInt(n);for(let i=0;i<size;i++){b[i]=Number(v&255n);v>>=8n;}return b;};

test("finalized receipt repair preserves funding, rejects mismatches, and wakes only after repair",async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"tsn-receipt-"));
  const names=["TSN_RECEIVER_LOCAL_FILE","TSN_RECEIVER_NODE_API_KEY","TSN_RPC_URL"];
  const previous=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  const realFetch=globalThis.fetch,realNow=Date.now;
  process.env.TSN_RECEIVER_LOCAL_FILE=path.join(directory,"store.json");
  process.env.TSN_RECEIVER_NODE_API_KEY="synthetic-receipt-key";
  process.env.TSN_RPC_URL="https://offline.invalid";
  try {
    for(const name of ["work-contract","settlement-retry", "native-work-retry","settlement-reconciliation","local-firestore","store","auth"]){
      const source=await readFile(new URL(`../lib/${name}.ts`,import.meta.url),"utf8");
      const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
        .replace(/from "\.\/([^".]+)"/g,'from "./$1.mjs"').replace('from "firebase-admin/firestore"','from "./firestore-stub.mjs"')
        .replace('from "@solana/web3.js"',`from ${JSON.stringify(import.meta.resolve("@solana/web3.js"))}`);
      await writeFile(path.join(directory,`${name}.mjs`),compiled);
    }
    const stubs={"firestore-stub":"export const FieldPath={};export const Timestamp={};",
      firebase:'import {localDb} from "./local-firestore.mjs";export const db=localDb;export const workCollection=db.collection("tsn_receiver_work");',
      "node-envelope":"export const decryptPayloadForNode=x=>x;export const encryptPayloadForNode=x=>x;",
      "node-verification":"export const assertNodeVerificationAttestation=()=>{};",
      "node-wake":"export const wakes=[]; export const wakeTsnNode=async reason=>{wakes.push(reason)};",
      "cranker-wake":"export const publishCrankerWake=async()=>{};",
      "next-stub":"export class NextResponse {static json(data,options={}){return {status:options.status??200,data};}}"};
    for(const [name,source]of Object.entries(stubs))await writeFile(path.join(directory,`${name}.mjs`),source);
    const source=await readFile(new URL("../app/api/internal/node/work/reconcile/route.ts",import.meta.url),"utf8");
    const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
      .replace('from "next/server"','from "./next-stub.mjs"').replace('from "../../../../../../lib/auth"','from "./auth.mjs"')
      .replace('from "../../../../../../lib/settlement-reconciliation"','from "./settlement-reconciliation.mjs"');
    await writeFile(path.join(directory,"route.mjs"),compiled);
    await writeFile(path.join(directory,"cranker-auth.mjs"),'export async function authenticateCrankerRequest(request){const owner=request.headers.get("x-test-cranker");if(!owner)throw new Error("CRANKER_SESSION_INVALID");return owner;} export async function enforceCrankerLeaseRateLimit(){}');
    const crankerSource=await readFile(new URL("../app/api/cranker/work/route.ts",import.meta.url),"utf8");
    const crankerCompiled=ts.transpileModule(crankerSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
      .replace('from "next/server"','from "./next-stub.mjs"').replace(/from "(?:\.\.\/)+lib\/([^".]+)"/g,'from "./$1.mjs"');
    await writeFile(path.join(directory,"cranker-report-route.mjs"),crankerCompiled);
    const recoveryRouteSource=await readFile(new URL("../app/api/internal/node/work/recover-pool/route.ts",import.meta.url),"utf8");
    const recoveryRoute=ts.transpileModule(recoveryRouteSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
      .replace('from "next/server"','from "./next-stub.mjs"').replace(/from "(?:\.\.\/)+lib\/([^".]+)"/g,'from "./$1.mjs"');
    await writeFile(path.join(directory,"recover-pool-route.mjs"),recoveryRoute);
    const load=n=>import(pathToFileURL(path.join(directory,`${n}.mjs`)).href);
    const {wakes}=await load("node-wake");
    const {workCollection,db}=await load("firebase");const {createReceivedWork}=await load("work-contract");
    const {assertSettlementReceipt,reconcileSettlementReceipt,reconcileExpiredCrankerConfirmation,recoverExpiredFundingPool}=await load("settlement-reconciliation");
    const {recordSettlementSubmission,leaseForCranker}=await load("store");const {POST}=await load("route");
    const {PATCH:reportConfirmation}=await load("cranker-report-route");
    const TSNP=new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"),TCAP=new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF"),TIP=new PublicKey("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT"),GPRU=new PublicKey("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR");
    const pda=(seed,program)=>PublicKey.findProgramAddressSync([Buffer.from(seed)],program)[0];
    const operatorKey=generateKeyPairSync("ed25519"),motherKey=generateKeyPairSync("ed25519");
    const pub=key=>new PublicKey(key.publicKey.export({format:"der",type:"spki"}).subarray(-32));
    const payer=pub(operatorKey),authority=pub(motherKey);
    const funding={...createReceivedWork({id:"synthetic-funding",kind:"AUTHORIZED_FUNDING",payload:{paymentId:"fixture"}}),status:"CONFIRMED",stateVersion:5,result:{signature:"synthetic-funding-signature"}};
    const id=`settlement-${hash(`${funding.id}:${funding.payloadCommitment}`).toString("hex").slice(0,32)}`;
    const h=n=>n.toString(16).padStart(2,"0").repeat(32);
    const t={authorizationDigest:h(1),validAfterSlot:"1",expiresAtSlot:"500",previousTcapRoot:h(2),tcapRootSequence:"1",tokenId:1,amountCommitment:h(8),nullifier:h(3),
      tcapConfig:pda("tcap:global-config:v1",TCAP).toBase58(),commitmentRoot:pda("tcap:commitment-root:v1",TCAP).toBase58(),
      assetEntry:new PublicKey(Buffer.alloc(32,5)).toBase58(),reserveState:new PublicKey(Buffer.alloc(32,6)).toBase58(),memoPayload:"synthetic encrypted memo",
      proof:{publicInputs:Array.from({length:13},(_,i)=>h(i+10)),proofA:"00".repeat(64),proofB:"00".repeat(128),proofC:"00".repeat(64),actionKind:1,tokenId:1,amountCommitment:h(8),authorizationCommitment:h(4)}};
    t.fundingRootAccount=PublicKey.findProgramAddressSync([Buffer.from("tcap:sealed-funding:v1"),new PublicKey(t.assetEntry).toBuffer(),Buffer.from(t.proof.publicInputs[12],"hex")],TCAP)[0].toBase58();
    t.accountingEpoch=PublicKey.findProgramAddressSync([Buffer.from("tcap:credit-epoch:v1"),new PublicKey(t.assetEntry).toBuffer(),uint(0,8)],TCAP)[0].toBase58();
    const work={...createReceivedWork({id,kind:"SETTLEMENT",payload:{intentId:funding.id,paymentId:"fixture"}}),status:"FAILED",stateVersion:28,
      authorization:{kind:"TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3",transition:t},result:{reason:"WebSocket failed to connect"},retryHistory:[{rejectedStateVersion:3}]};
    const ixKeys=[authority,pda("tsn_mother_escrow",TSNP),TCAP,TSNP,new PublicKey(t.tcapConfig),new PublicKey(t.assetEntry),new PublicKey(t.commitmentRoot),new PublicKey(t.reserveState),PublicKey.findProgramAddressSync([Buffer.from("tsn:tcap-authorization:v1"),Buffer.from(t.authorizationDigest,"hex")],TSNP)[0],pda("tip:route-merkle-root:v1",TIP),pda("gpru:hidden-head-verifier:v1",GPRU),new PublicKey("Sysvar1nstructions1111111111111111111111111"),GPRU,new PublicKey(t.fundingRootAccount),new PublicKey(t.accountingEpoch),PublicKey.default];
    const memoProgram=new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    const keys=[payer,authority,new PublicKey(t.commitmentRoot),new PublicKey(t.accountingEpoch),...ixKeys.filter(k=>!k.equals(authority)),memoProgram].filter((k,i,a)=>a.findIndex(v=>v.equals(k))===i);
    const proof=t.proof;
    const data=Buffer.concat([hash("global:tsn_register_tcap_credit_authorization_v3").subarray(0,8),Buffer.from(t.authorizationDigest,"hex"),uint(1,8),uint(500,8),Buffer.from(t.previousTcapRoot,"hex"),uint(1,8),uint(1,4),Buffer.from(t.amountCommitment,"hex"),Buffer.from(t.nullifier,"hex"),...proof.publicInputs.map(x=>Buffer.from(x,"hex")),Buffer.alloc(256),uint(1,1),uint(1,4),Buffer.from(proof.amountCommitment,"hex"),Buffer.from(proof.authorizationCommitment,"hex")]);
    const memo=Buffer.from(t.memoPayload);
    const idx=k=>keys.findIndex(v=>v.equals(k));
    const message=Buffer.concat([Buffer.from([0x81,2,0,keys.length-4]),uint(12,4),Buffer.alloc(32),Buffer.from([2,keys.length]),...keys.map(k=>k.toBuffer()),uint(1400000,4),uint(64*1024*1024,4),Buffer.from([idx(TSNP),16]),uint(data.length,2),Buffer.from([idx(memoProgram),1]),uint(memo.length,2),Buffer.from(ixKeys.map(idx)),data,Buffer.from([0]),memo]);
    const payerSig=sign(null,message,operatorKey.privateKey),motherSig=sign(null,message,motherKey.privateKey),signature=b58(payerSig);
    const receipt={version:1,slot:100,meta:{err:null},transaction:[Buffer.concat([message,payerSig,motherSig]).toString("base64"),"base64"]};
    const motherData=Buffer.concat([hash("account:MotherEscrow").subarray(0,8),authority.toBuffer()]);
    const mother={owner:TSNP.toBase58(),data:[motherData.toString("base64"),"base64"]};
    const rootData=Buffer.alloc(124);hash("account:TcapCommitmentRootStateV1").copy(rootData,0,0,8);Buffer.from(proof.publicInputs[1],"hex").copy(rootData,12);Buffer.from(t.previousTcapRoot,"hex").copy(rootData,44);uint(1,8).copy(rootData,80);
    const root={owner:TCAP.toBase58(),data:[rootData.toString("base64"),"base64"]};
    assert.equal(assertSettlementReceipt(work,signature,receipt,mother,root).slot,100);
    for(const changed of [{...receipt,meta:{err:{InstructionError:[0,1]}}},{...receipt,version:0},{...receipt,slot:null}])assert.throws(()=>assertSettlementReceipt(work,signature,changed,mother,root));
    for(const changed of [{...t,amountCommitment:h(9)},{...t,memoPayload:"changed"},{...t,assetEntry:authority.toBase58()},
      {...t,fundingRootAccount:authority.toBase58()}, {...t,proof:{...proof,publicInputs:proof.publicInputs.slice(0,12)}},
      {...t,proof:{...proof,publicInputs:[...proof.publicInputs.slice(0,12),h(77)]}}])assert.throws(()=>assertSettlementReceipt({...work,authorization:{...work.authorization,transition:changed}},signature,receipt,mother,root));
    assert.throws(()=>assertSettlementReceipt({...work,result:{signature:"different-signature"}},signature,receipt,mother,root),/SIGNATURE_MISMATCH/);
    assert.throws(()=>assertSettlementReceipt(work,signature,receipt,{...mother,owner:TCAP.toBase58()},root));
    assert.throws(()=>assertSettlementReceipt(work,signature,receipt,mother,{...root,owner:TSNP.toBase58()}));
    // Dedicated coordination receipts bind every public ledger checkpoint.
    for(const kind of ["TCAP_FUNDING_POOL","TCAP_EPOCH_ACCOUNTING"]){
      const scalar=n=>BigInt(n).toString(16).padStart(64,"0");
      const value={assetEntry:t.assetEntry,reserveState:t.reserveState,tcapConfig:t.tcapConfig};
      let state,accounts,payload;
      if(kind==="TCAP_FUNDING_POOL"){
        Object.assign(value,{root:scalar(19),eligibleNoteCount:"2",sourceWalletCount:2,releaseSlot:"110"});
        const [pool,bump]=PublicKey.findProgramAddressSync([Buffer.from("tcap:sealed-funding:v1"),new PublicKey(t.assetEntry).toBuffer(),Buffer.from(value.root,"hex")],TCAP);
        accounts=[authority,pda("tsn_mother_escrow",TSNP),new PublicKey(t.tcapConfig),new PublicKey(t.assetEntry),pda("tcap:funding-root:v1",TCAP),pool,PublicKey.default];
        payload=Buffer.concat([hash("global:seal_private_funding_pool_v1").subarray(0,8),Buffer.from(value.root,"hex"),uint(2,8),uint(2,2),uint(110,8)]);
        state=Buffer.alloc(113);hash("account:TcapSealedFundingPoolV1").copy(state,0,0,8);state.writeUInt16LE(1,8);state[10]=bump;new PublicKey(t.assetEntry).toBuffer().copy(state,11);
        uint(1,4).copy(state,43);Buffer.from(value.root,"hex").copy(state,47);uint(2,8).copy(state,79);uint(2,8).copy(state,87);uint(2,2).copy(state,95);uint(100,8).copy(state,97);uint(110,8).copy(state,105);
      }else{
        Object.assign(value,{accountingEpoch:t.accountingEpoch,total:"500",proof:{publicInputs:[scalar(19),scalar(20),scalar(500),scalar(2),scalar(1)],proofA:"00".repeat(64),proofB:"00".repeat(128),proofC:"00".repeat(64)}});
        accounts=[authority,pda("tsn_mother_escrow",TSNP),new PublicKey(t.tcapConfig),new PublicKey(t.assetEntry),new PublicKey(t.reserveState),new PublicKey(t.accountingEpoch),pda("gpru:tcap-epoch-verifier:v1",GPRU),GPRU];
        payload=Buffer.concat([hash("global:account_credit_epoch_v1").subarray(0,8),uint(500,8),...value.proof.publicInputs.map(v=>Buffer.from(v,"hex")),Buffer.alloc(256)]);
        state=Buffer.alloc(136);hash("account:TcapCreditEpochV1").copy(state,0,0,8);state.writeUInt16LE(1,8);state[10]=PublicKey.findProgramAddressSync([Buffer.from("tcap:credit-epoch:v1"),new PublicKey(t.assetEntry).toBuffer(),uint(0,8)],TCAP)[1];
        new PublicKey(t.assetEntry).toBuffer().copy(state,11);uint(1,4).copy(state,51);Buffer.from(scalar(19),"hex").copy(state,55);Buffer.from(scalar(20),"hex").copy(state,87);uint(2,8).copy(state,119);state[135]=1;
      }
      const writable=kind==="TCAP_FUNDING_POOL"?[accounts[5]]:[accounts[4],accounts[5]];
      const keys=[payer,authority,...writable,...accounts,TCAP].filter((k,i,a)=>a.findIndex(v=>v.equals(k))===i),index=k=>keys.findIndex(v=>v.equals(k));
      const makeReceipt=(readonly=keys.length-2-writable.length)=>{const msg=Buffer.concat([Buffer.from([0x81,2,0,readonly]),uint(12,4),Buffer.alloc(32),Buffer.from([1,keys.length]),...keys.map(k=>k.toBuffer()),uint(1400000,4),uint(64*1024*1024,4),Buffer.from([index(TCAP),accounts.length]),uint(payload.length,2),Buffer.from(accounts.map(index)),payload]);
        const sig=sign(null,msg,operatorKey.privateKey);return {signature:b58(sig),receipt:{version:1,slot:100,meta:{err:null},transaction:[Buffer.concat([msg,sig,sign(null,msg,motherKey.privateKey)]).toString("base64"),"base64"]}};};
      const {signature,receipt}=makeReceipt(),cw={kind,authorization:{transition:value}},root={owner:TCAP.toBase58(),data:[state.toString("base64"),"base64"]};
      assert.equal(assertSettlementReceipt(cw,signature,receipt,mother,root).slot,100);
      for(const offset of kind==="TCAP_FUNDING_POOL"?[8,10,11,47,79,87,95,105]:[8,10,11,43,51,55,87,119,135]){const changed=Buffer.from(state);changed[offset]^=offset===79?2:1;
        assert.throws(()=>assertSettlementReceipt(cw,signature,receipt,mother,{...root,data:[changed.toString("base64"),"base64"]}),/RECEIPT_MISMATCH/);}
      const wrong=makeReceipt(keys.length-3-writable.length);
      assert.throws(()=>assertSettlementReceipt(cw,wrong.signature,wrong.receipt,mother,root),/PERMISSIONS/);
    }
    await workCollection.doc(funding.id).create(funding);await workCollection.doc(id).create(work);
    let calls=0;
    globalThis.fetch=async(url,init)=>{
      assert.equal(String(url),"https://offline.invalid");const b=JSON.parse(init.body);calls++;
      assert.ok(["getTransaction","getAccountInfo"].includes(b.method),"receipt repair has no mutating RPC methods");
      const result=b.method==="getTransaction"?(b.params[0]===signature?receipt:{meta:{err:null}}):{value:b.params[0]===t.commitmentRoot?root:mother};
      return new Response(JSON.stringify({jsonrpc:"2.0",id:b.id,result}));
    };
    const request=(key,body={id,expectedVersion:28,signature,execute:false})=>({headers:new Headers({"x-api-key":key}),json:async()=>body});
    assert.equal((await POST(request("bad"))).status,401);assert.equal(calls,0);
    assert.equal((await POST(request("synthetic-receipt-key",{id,expectedVersion:"28",signature,execute:false}))).status,400);
    assert.equal((await POST(request("synthetic-receipt-key"))).status,200);
    assert.deepEqual((await workCollection.doc(id).get()).data(),work);
    assert.equal(wakes.length,0);
    await assert.rejects(reconcileSettlementReceipt({id,expectedVersion:27,signature,execute:true}),/STALE_STATE_VERSION/);
    const response=await POST(request("synthetic-receipt-key",{id,expectedVersion:28,signature,execute:true}));
    assert.equal(response.status,200);assert.equal(response.data.stateVersion,29);
    assert.deepEqual(wakes,["PRIVATE_CREDIT_RECEIPT_RECONCILED"]);
    const after=(await workCollection.doc(id).get()).data();assert.equal(after.status,"CONFIRMED");assert.equal(after.authorization,null);
    assert.deepEqual(after.payload,work.payload);assert.deepEqual(after.retryHistory,work.retryHistory);
    assert.deepEqual(after.reconciliationHistory[0].previousResult,work.result);assert.equal(after.result.signature,signature);
    assert.deepEqual((await workCollection.doc(funding.id).get()).data(),funding);
    assert.equal((await POST(request("synthetic-receipt-key",{id,expectedVersion:28,signature,execute:true}))).status,409);

    // Durable pre-broadcast identity is lease-guarded and cannot be replaced.
    await db.runTransaction(async tx=>{await tx.get(workCollection.doc(id));tx.update(workCollection.doc(id),{...work,status:"CRANKER_LEASED",result:null,crankerLease:{owner:payer.toBase58(),expiresAt:new Date(realNow()+60000).toISOString(),leaseId:id,version:28}});});
    const evidence={signature,blockhash:"11111111111111111111111111111111",lastValidBlockHeight:"1000",wireSha256:"ab".repeat(32),wireBytes:2909,stage:"TCAP_GPRU_MEMO_CREDIT_V2_SIGNED"};
    await assert.rejects(recordSettlementSubmission({id,owner:authority.toBase58(),expectedVersion:28,evidence}),/LEASE_INVALID/);
    await recordSettlementSubmission({id,owner:payer.toBase58(),expectedVersion:28,evidence});
    await recordSettlementSubmission({id,owner:payer.toBase58(),expectedVersion:28,evidence});
    await assert.rejects(recordSettlementSubmission({id,owner:payer.toBase58(),expectedVersion:28,evidence:{...evidence,wireSha256:"cd".repeat(32)}}),/ALREADY_RECORDED/);
    Date.now=()=>realNow()+120000;
    assert.equal(await leaseForCranker(payer.toBase58(),["SETTLEMENT"]),null);
    const expired=(await workCollection.doc(id).get()).data();assert.equal(expired.status,"FAILED");assert.equal(expired.crankerLease,null);assert.equal(expired.result.signature,signature);

    // Signing was completed in time, but HTTP confirmation/reporting outlived the lease.
    const leaseExpiry=new Date(realNow()+60_000).toISOString();
    const checkpoint={...evidence,wireSha256:createHash("sha256").update(Buffer.from(receipt.transaction[0],"base64")).digest("hex"),wireBytes:Buffer.from(receipt.transaction[0],"base64").length};
    const lateWork={...work,status:"CRANKER_LEASED",stateVersion:28,result:checkpoint,
      authorization:{...work.authorization,workStateVersion:27,leaseId:id,leaseVersion:27,leaseExpiresAt:leaseExpiry},
      crankerLease:{owner:payer.toBase58(),leaseId:id,version:27,expiresAt:leaseExpiry}};
    const reset=async value=>db.runTransaction(async tx=>{await tx.get(workCollection.doc(id));tx.set(workCollection.doc(id),value);});
    const reportParams={id,owner:payer.toBase58(),expectedVersion:28,signature};
    const reportRequest=(owner=payer.toBase58(),body={id,expectedVersion:28,status:"CONFIRMED",evidence:{signature}})=>({headers:new Headers(owner?{"x-test-cranker":owner}:{}),text:async()=>JSON.stringify(body)});
    await reset(lateWork);
    assert.equal((await reportConfirmation(reportRequest(null))).status,401);
    for(const changed of [
      {...lateWork,result:null}, {...lateWork,nodeLease:{owner:"another-node"}},
      {...lateWork,stateVersion:30}, {...lateWork,status:"VERIFIED"},
      {...lateWork,authorization:{...lateWork.authorization,leaseVersion:26}},
      {...lateWork,authorization:{...lateWork.authorization,leaseExpiresAt:"invalid"}},
    ]) {
      await reset(changed);
      await assert.rejects(reconcileExpiredCrankerConfirmation(reportParams),/NOT_ELIGIBLE/);
    }
    await reset(lateWork);
    Date.now=realNow;
    await assert.rejects(reconcileExpiredCrankerConfirmation(reportParams),/NOT_ELIGIBLE/);
    Date.now=()=>realNow()+120000;
    await assert.rejects(reconcileExpiredCrankerConfirmation({...reportParams,expectedVersion:27}),/NOT_ELIGIBLE/);
    await assert.rejects(reconcileExpiredCrankerConfirmation({...reportParams,signature:signature.slice(0,-1)+(signature.endsWith("1")?"2":"1")}),/SIGNATURE_MISMATCH/);
    for(const changed of [
      {...lateWork,result:{...checkpoint,wireSha256:"cd".repeat(32)}},
      {...lateWork,result:{...checkpoint,wireBytes:checkpoint.wireBytes+1}},
      {...lateWork,result:{...checkpoint,blockhash:authority.toBase58()}},
    ]) {
      await reset(changed);
      await assert.rejects(reconcileExpiredCrankerConfirmation(reportParams),/SUBMISSION_MISMATCH/);
    }
    await reset({...lateWork,status:"FAILED",stateVersion:29,crankerLease:null});
    await assert.rejects(reconcileExpiredCrankerConfirmation({...reportParams,owner:authority.toBase58()}),/SUBMISSION_MISMATCH/);
    const failedRpcFetch=globalThis.fetch;
    globalThis.fetch=async()=>new Response(JSON.stringify({jsonrpc:"2.0",id:1,result:null}));
    assert.equal((await reportConfirmation(reportRequest())).status,409);
    assert.equal((await workCollection.doc(id).get()).data().status,"FAILED");
    globalThis.fetch=failedRpcFetch;
    await reset(lateWork);
    const confirmedLate=await reportConfirmation(reportRequest());
    assert.equal(confirmedLate.status,200);
    assert.equal(confirmedLate.data.status,"CONFIRMED");
    assert.equal(confirmedLate.data.receipt.confirmationStatus,"finalized");
    assert.equal(confirmedLate.data.stateVersion,29);
    assert.equal((await workCollection.doc(id).get()).data().crankerLease,null);
    assert.equal((await reportConfirmation(reportRequest())).status,200,"same terminal signature remains idempotent");
    await reset(lateWork);
    let reclaimed=false;
    globalThis.fetch=async(url,init)=>{
      const b=JSON.parse(init.body);
      if(!reclaimed){reclaimed=true;await reset({...lateWork,status:"FAILED",stateVersion:29,crankerLease:null});}
      return failedRpcFetch(url,init);
    };
    const reclaimedResponse=await reportConfirmation(reportRequest());
    assert.equal(reclaimedResponse.status,200);
    assert.equal(reclaimedResponse.data.stateVersion,30);
    const reconciled=(await workCollection.doc(id).get()).data();
    assert.equal(reconciled.reconciliationHistory.at(-1).previousStatus,"FAILED");
    assert.equal(reconciled.reconciliationHistory.at(-1).reportedBy,payer.toBase58());
    assert.deepEqual(reconciled.payload,work.payload);
    assert.deepEqual(reconciled.retryHistory,work.retryHistory);
    assert.deepEqual((await workCollection.doc(funding.id).get()).data(),funding);
    // A changed authorization during receipt reads cannot be accepted.
    await reset(lateWork);reclaimed=false;
    globalThis.fetch=async(url,init)=>{
      if(!reclaimed){reclaimed=true;await reset({...lateWork,authorization:{...lateWork.authorization,transition:{...t,memoPayload:"changed"}}});}
      return failedRpcFetch(url,init);
    };
    assert.equal((await reportConfirmation(reportRequest())).status,409);
    assert.equal((await workCollection.doc(id).get()).data().status,"CRANKER_LEASED");

    // Recovery is separate from receipt repair and proves the immutable pool absent after expiry.
    const poolPayload={assetEntry:t.assetEntry,tcapConfig:t.tcapConfig,reserveState:t.reserveState,root:h(11)};
    const poolId="tcap-pool-"+createHash("sha256").update(Buffer.concat([new PublicKey(t.assetEntry).toBuffer(),Buffer.from(poolPayload.root,"hex")])).digest("hex");
    const failedPool={...createReceivedWork({id:poolId,kind:"TCAP_FUNDING_POOL",payload:poolPayload}),status:"FAILED",stateVersion:8,
      authorization:{kind:"TSN_TCAP_COORDINATION_AUTHORIZATION_V1",transition:poolPayload,leaseExpiresAt:"2000-01-01T00:00:00Z"},
      result:{...checkpoint,signature,blockhash:PublicKey.default.toBase58(),lastValidBlockHeight:"1000",stage:"TCAP_FUNDING_POOL_V1_SIGNED"},
      nodeLease:null,crankerLease:null};
    const poolRef=workCollection.doc(poolId);
    await poolRef.create(failedPool);
    const recovery={id:poolId,expectedVersion:8,signature,execute:false};
    const {POST:recoverPoolRoute}=await load("recover-pool-route");
    const recoveryRequest=(key="synthetic-receipt-key",body=recovery)=>({headers:new Headers({"x-api-key":key}),json:async()=>body});
    assert.equal((await recoverPoolRoute(recoveryRequest("wrong"))).status,401);
    assert.equal((await recoverPoolRoute(recoveryRequest(undefined,{...recovery,execute:"true"}))).status,400);
    const recoveryFetch=overrides=>async(_url,init)=>{
      const b=JSON.parse(init.body),ctx={slot:2000};
      const results={getBlock:{blockHeight:1001},getSlot:2000,isBlockhashValid:{context:ctx,value:false},
        getAccountInfo:{context:ctx,value:null},getTransaction:null,getSignatureStatuses:{context:ctx,value:[null]},...overrides};
      assert.ok(b.method in results);
      if(b.method==="getAccountInfo" || b.method==="isBlockhashValid") assert.equal(b.params[1].minContextSlot,2000);
      return new Response(JSON.stringify({jsonrpc:"2.0",id:b.id,result:results[b.method]}));
    };
    globalThis.fetch=recoveryFetch({});
    const originalPool=(await poolRef.get()).data(),beforeRecoveryWakes=wakes.length;
    const preview=await recoverExpiredFundingPool(recovery);
    assert.equal(preview.executed,false);
    assert.equal(preview.finalizedBlockHeight,"1001");
    assert.equal((await recoverPoolRoute(recoveryRequest())).status,200);
    assert.deepEqual((await poolRef.get()).data(),originalPool);
    for(const [override,error] of [
      [{getBlock:{blockHeight:1000}},/LIFETIME_NOT_EXPIRED/], [{isBlockhashValid:{context:{slot:2000},value:true}},/LIFETIME_NOT_EXPIRED/],
      [{getAccountInfo:{context:{slot:2000},value:{owner:TCAP.toBase58()}}},/EXECUTION_FOUND/],
      [{getTransaction:receipt},/EXECUTION_FOUND/], [{getSignatureStatuses:{value:[{err:null}]}},/EXECUTION_FOUND/],
      [{getAccountInfo:{context:{slot:1999},value:null}},/RPC_CONTEXT_INVALID/],
      [{isBlockhashValid:{context:{},value:false}},/RPC_CONTEXT_INVALID/]
    ]) {
      globalThis.fetch=recoveryFetch(override);
      await assert.rejects(recoverExpiredFundingPool({...recovery,execute:true}),error);
      assert.deepEqual((await poolRef.get()).data(),originalPool);
    }
    assert.equal(wakes.length,beforeRecoveryWakes);
    globalThis.fetch=recoveryFetch({});
    await assert.rejects(recoverExpiredFundingPool({...recovery,expectedVersion:7}),/STALE_STATE_VERSION/);
    await assert.rejects(recoverExpiredFundingPool({...recovery,signature:"2".repeat(87)}),/ATTEMPT_INVALID/);
    await assert.rejects(recoverExpiredFundingPool({...recovery,id:work.id}),/KIND_INVALID/);
    let changedPool=false;
    const cleanRecoveryFetch=globalThis.fetch;
    globalThis.fetch=async(url,init)=>{
      if(!changedPool){changedPool=true;await db.runTransaction(async tx=>{await tx.get(poolRef);tx.update(poolRef,{stateVersion:9});});}
      return cleanRecoveryFetch(url,init);
    };
    await assert.rejects(recoverExpiredFundingPool({...recovery,execute:true}),/STALE_STATE_VERSION/);
    await db.runTransaction(async tx=>{await tx.get(poolRef);tx.set(poolRef,originalPool);});
    globalThis.fetch=cleanRecoveryFetch;
    const recovered=await recoverExpiredFundingPool({...recovery,execute:true});
    assert.equal(recovered.status,"RECEIVED");
    assert.equal(recovered.stateVersion,9);
    const retriablePool=(await poolRef.get()).data();
    assert.equal(retriablePool.result,null);
    assert.equal(retriablePool.verification,null);
    assert.equal(retriablePool.authorization,null);
    assert.deepEqual(retriablePool.payload,originalPool.payload);
    assert.deepEqual(retriablePool.reconciliationHistory.at(-1).previousResult,originalPool.result);
    assert.deepEqual((await workCollection.doc(funding.id).get()).data(),funding);
    assert.equal(wakes.length,beforeRecoveryWakes+1);
  } finally {
    globalThis.fetch=realFetch;Date.now=realNow;
    for(const n of names)if(previous[n]===undefined)delete process.env[n];else process.env[n]=previous[n];
    await rm(directory,{recursive:true,force:true});
  }
});
