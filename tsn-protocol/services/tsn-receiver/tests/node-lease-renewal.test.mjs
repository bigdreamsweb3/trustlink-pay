import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

test("Node renewal preserves its generation and signed decisions after the original lease expires", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-node-lease-"));
  const names = ["TSN_RECEIVER_LOCAL_FILE", "TSN_RECEIVER_NODE_API_KEY", "TSN_NODE_VERIFICATION_PUBLIC_KEY"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const realNow = Date.now;
  let clock = realNow();
  process.env.TSN_RECEIVER_LOCAL_FILE = path.join(directory, "receiver.json");
  process.env.TSN_RECEIVER_NODE_API_KEY = "synthetic-node-credential";
  const keys = generateKeyPairSync("ed25519");
  const rawPublic = keys.publicKey.export({format:"der",type:"spki"}).subarray(-32);
  process.env.TSN_NODE_VERIFICATION_PUBLIC_KEY = rawPublic.toString("hex");
  try {
    for (const name of ["work-contract", "settlement-retry", "native-work-retry", "local-firestore", "store", "auth", "node-verification"]) {
      const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
      let compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
      compiled = compiled.replace(/from "\.\/([^".]+)"/g, 'from "./$1.mjs"')
        .replace('from "firebase-admin/firestore"', 'from "./firestore-stub.mjs"');
      await writeFile(path.join(directory, `${name}.mjs`), compiled);
    }
    await writeFile(path.join(directory, "firestore-stub.mjs"), "export const FieldPath = {}; export const Timestamp = {};");
    await writeFile(path.join(directory, "firebase.mjs"), 'import {localDb} from "./local-firestore.mjs"; export const db=localDb; export const workCollection=db.collection("tsn_receiver_work");');
    await writeFile(path.join(directory, "node-envelope.mjs"), "export const decryptPayloadForNode=x=>x; export const encryptPayloadForNode=x=>x;");
    await writeFile(path.join(directory, "node-wake.mjs"), "export const wakeTsnNode=async()=>{};");
    await writeFile(path.join(directory, "cranker-wake.mjs"), "export const publishCrankerWake=async()=>{};");
    await writeFile(path.join(directory, "next-stub.mjs"), "export class NextResponse {static json(data,options={}) {return {status:options.status??200,data};}}");
    const source = await readFile(new URL("../app/api/internal/node/work/route.ts", import.meta.url), "utf8");
    let route = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
    route = route.replace('from "next/server"','from "./next-stub.mjs"')
      .replace('from "../../../../../lib/auth"','from "./auth.mjs"')
      .replace('from "../../../../../lib/store"','from "./store.mjs"');
    await writeFile(path.join(directory, "route.mjs"), route);
    const load = name => import(pathToFileURL(path.join(directory,`${name}.mjs`)).href);
    const {db,workCollection} = await load("firebase");
    const {createReceivedWork,payloadCommitment,crankerExecutionPayload} = await load("work-contract");
    const {leaseForNode,renewNodeLease,transition} = await load("store");
    const {PUT} = await load("route");
    Date.now = () => clock;
    const funding = {...createReceivedWork({id:"mock-funding",kind:"AUTHORIZED_FUNDING",payload:{paymentId:"mock-payment"}}),
      status:"CONFIRMED",stateVersion:5,result:{signature:"mock-confirmed-funding"}};
    const received = createReceivedWork({id:"mock-settlement",kind:"SETTLEMENT",payload:{intentId:funding.id,paymentId:"mock-payment",source:"tsn-receiver-at-ingress"}});
    await workCollection.doc(funding.id).create(funding);
    await workCollection.doc(received.id).create(received);
    const work = await leaseForNode("mock-node",["SETTLEMENT"]);
    assert.equal(work.status,"NODE_VERIFYING");
    const originalExpiry = Date.parse(work.nodeLease.expiresAt);
    const params = {id:work.id,owner:"mock-node",expectedVersion:work.stateVersion,
      leaseId:work.nodeLease.leaseId,leaseVersion:work.nodeLease.version};
    const request = (key="synthetic-node-credential",body=params) => ({headers:new Headers({"x-api-key":key}),json:async()=>body});
    assert.equal((await PUT(request("wrong"))).status,401);
    assert.equal((await PUT(request(undefined,{...params,expectedVersion:"2"}))).status,400);
    assert.equal((await PUT(request(undefined,{...params,leaseVersion:0}))).status,400);
    assert.equal((await PUT(request(undefined,{...params,id:"missing"}))).status,404);
    for (const change of [{owner:"other-node"},{leaseId:"other-claim"},{leaseVersion:99},{expectedVersion:99}]) {
      const response = await PUT(request(undefined,{...params,...change}));
      assert.equal(response.status,409);
    }
    assert.deepEqual((await workCollection.doc(work.id).get()).data(),work);

    for (let step=0;step<4;step++) {
      clock += 20_000;
      const response = await PUT(request());
      assert.equal(response.status,200);
      assert.equal(response.data.stateVersion,work.stateVersion);
      assert.equal(response.data.nodeLease.version,work.nodeLease.version);
      assert.equal(response.data.nodeLease.leaseId,work.nodeLease.leaseId);
      assert.equal(Date.parse(response.data.nodeLease.expiresAt),clock+60_000);
    }
    assert.ok(clock > originalExpiry);
    const active = (await workCollection.doc(work.id).get()).data();
    assert.deepEqual(active.payload,work.payload);
    assert.equal(active.payloadCommitment,work.payloadCommitment);
    assert.equal(active.status,"NODE_VERIFYING");
    assert.equal(active.verification,work.verification);

    // Use the real Receiver verifier with a synthetic Ed25519 decision.
    // No proof, chain transaction or user-controlled key is used here.
    const evidence = {verificationType:"TSN_TCAP_GPRU_HIDDEN_HEAD_V1",verifiedPayload:{tcapCreditTransition:{tokenId:1,amountBaseUnits:"100"}}};
    const attestation = {version:1,algorithm:"Ed25519",workId:work.id,workKind:work.kind,decision:"VERIFIED",
      inputPayloadCommitment:work.payloadCommitment,evidenceCommitment:payloadCommitment(evidence),
      executionPayloadCommitment:payloadCommitment(crankerExecutionPayload(work.kind,evidence.verifiedPayload)),
      verificationType:evidence.verificationType,leaseId:work.nodeLease.leaseId,leaseVersion:work.nodeLease.version,
      nodeId:params.owner,keyId:createHash("sha256").update(rawPublic).digest("hex").slice(0,24),signedAt:new Date(clock).toISOString()};
    const fields=["version","workId","workKind","decision","inputPayloadCommitment","evidenceCommitment",
      "executionPayloadCommitment","verificationType","leaseId","leaseVersion","nodeId","keyId","signedAt"];
    attestation.signatureBase64=sign(null,Buffer.from(`TSN_NODE_VERIFICATION_V1\n${fields.map(field=>String(attestation[field])).join("\n")}`),keys.privateKey).toString("base64");
    await transition({id:work.id,actor:"node",owner:params.owner,expectedVersion:work.stateVersion,status:"VERIFIED",
      evidence:{...evidence,nodeAttestation:attestation}});
    const verified=(await workCollection.doc(work.id).get()).data();
    assert.equal(verified.status,"VERIFIED");
    assert.equal(verified.stateVersion,work.stateVersion+1);
    assert.equal((await PUT(request())).status,409); // Completion cannot be revived.
    assert.deepEqual((await workCollection.doc(funding.id).get()).data(),funding);

    const expired={...work,id:"mock-expired",nodeLease:{...work.nodeLease,leaseId:"mock-expired",expiresAt:new Date(clock).toISOString()}};
    await workCollection.doc(expired.id).create(expired);
    await assert.rejects(renewNodeLease({...params,id:expired.id,leaseId:expired.id}),/LEASE_INVALID/);
    assert.deepEqual((await workCollection.doc(expired.id).get()).data(),expired);
    // A newer owner/generation cannot be renewed using the old claim context.
    await db.runTransaction(async transaction=>{
      await transaction.get(workCollection.doc(expired.id));
      transaction.update(workCollection.doc(expired.id),{stateVersion:work.stateVersion+2,
        nodeLease:{owner:"other-node",leaseId:expired.id,version:work.stateVersion+2,expiresAt:new Date(clock+60_000).toISOString()}});
    });
    await assert.rejects(renewNodeLease({...params,id:expired.id,leaseId:expired.id}),/STALE_STATE_VERSION/);
  } finally {
    Date.now=realNow;
    for(const name of names) if(previous[name]===undefined) delete process.env[name]; else process.env[name]=previous[name];
    await rm(directory,{recursive:true,force:true});
  }
});
