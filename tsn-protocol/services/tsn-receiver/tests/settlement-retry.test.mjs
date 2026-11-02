import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

test("repaired settlement retry is authenticated, versioned, funded and preserves the original records", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-settlement-retry-"));
  const previousFile = process.env.TSN_RECEIVER_LOCAL_FILE;
  const previousKey = process.env.TSN_RECEIVER_NODE_API_KEY;
  process.env.TSN_RECEIVER_LOCAL_FILE = path.join(directory, "receiver.json");
  process.env.TSN_RECEIVER_NODE_API_KEY = "isolated-test-credential";
  try {
    for (const name of ["work-contract", "settlement-retry", "local-firestore", "store", "auth"]) {
      const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
      let compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
      compiled = compiled.replace(/from "\.\/([^".]+)"/g, 'from "./$1.mjs"')
        .replace('from "firebase-admin/firestore"', 'from "./firestore-stub.mjs"');
      await writeFile(path.join(directory, `${name}.mjs`), compiled);
    }
    await writeFile(path.join(directory, "firestore-stub.mjs"), "export const FieldPath = {}; export const Timestamp = {};");
    await writeFile(path.join(directory, "firebase.mjs"), 'import {localDb} from "./local-firestore.mjs"; export const db=localDb; export const workCollection=db.collection("tsn_receiver_work");');
    await writeFile(path.join(directory, "node-envelope.mjs"), "export const decryptPayloadForNode = x=>x; export const encryptPayloadForNode = x=>x;");
    await writeFile(path.join(directory, "node-verification.mjs"), "export const assertNodeVerificationAttestation = ()=>{};");
    await writeFile(path.join(directory, "node-wake.mjs"), "export const wakes=[]; export const wakeTsnNode=async reason=>{wakes.push(reason)};");
    await writeFile(path.join(directory, "cranker-wake.mjs"), "export const publishCrankerWake = async ()=>{};");
    await writeFile(path.join(directory, "next-stub.mjs"), "export class NextResponse { static json(data, options={}) { return {status:options.status??200,data}; } }");
    const routeSource = await readFile(new URL("../app/api/internal/node/work/retry/route.ts", import.meta.url), "utf8");
    let routeCompiled = ts.transpileModule(routeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    routeCompiled = routeCompiled.replace('from "next/server"', 'from "./next-stub.mjs"')
      .replace('from "../../../../../../lib/auth"', 'from "./auth.mjs"')
      .replace('from "../../../../../../lib/store"', 'from "./store.mjs"');
    await writeFile(path.join(directory, "route.mjs"), routeCompiled);

    const load = name => import(pathToFileURL(path.join(directory, `${name}.mjs`)).href);
    const { workCollection, db } = await load("firebase");
    const { createReceivedWork } = await load("work-contract");
    const { snapshotRetryPatch } = await load("settlement-retry");
    const { POST } = await load("route");
    const { wakes } = await load("node-wake");
    const funding = { ...createReceivedWork({ id: "mock-funding", kind: "AUTHORIZED_FUNDING", payload: { paymentId: "mock-payment", recipientHash: "mock-owner" } }), status: "CONFIRMED", stateVersion: 5, result: { signature: "mock-confirmed-deposit-signature" } };
    const id = `settlement-${createHash("sha256").update(`${funding.id}:${funding.payloadCommitment}`).digest("hex").slice(0,32)}`;
    const settlement = { ...createReceivedWork({ id, kind: "SETTLEMENT", payload: { paymentId: "mock-payment", intentId: funding.id, source: "tsn-receiver-at-ingress" } }), status: "REJECTED", stateVersion: 3, verification: { reason: "GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: no snapshot for the chain-selected root", nodeAttestation: { signatureBase64: "mock-rejection-attestation" } } };
    await workCollection.doc(funding.id).create(funding);
    await workCollection.doc(id).create(settlement);
    const request = (key, body={id,expectedVersion:3}) => ({ headers: new Headers({"x-api-key":key}), json: async()=>body });
    assert.equal((await POST(request("incorrect"))).status, 401);
    assert.equal((await POST(request("isolated-test-credential", {id,expectedVersion:2}))).status, 409);
    assert.equal((await POST(request("isolated-test-credential", {id,expectedVersion:"3"}))).status, 400);
    assert.deepEqual((await workCollection.doc(id).get()).data(), settlement);
    assert.equal(wakes.length, 0);

    for (const changed of [
      {...funding,status:"CRANKER_LEASED"}, {...funding,result:{}},
    ]) assert.throws(()=>snapshotRetryPatch(settlement,changed,3,"test"), /FUNDING_NOT_CONFIRMED/);
    for (const changed of [
      {...settlement,status:"CONFIRMED"}, {...settlement,kind:"AUTHORIZED_FUNDING"},
      {...settlement,verification:{reason:"bad proof"}}, {...settlement,result:{signature:"ambiguous-execution"}},
      {...settlement,nodeLease:{leaseId:"active-node-lease"}}, {...settlement,crankerLease:{leaseId:"active-cranker-lease"}},
      {...settlement,authorization:{signature:"existing-authorization"}}, {...settlement,result:{error:"ambiguous-submission"}},
      {...settlement,verification:{reason:"TCAP settlement reserve lacks funded pending liabilities or is insolvent"}},
      {...settlement,verification:{reason:"TCAP settlement asset is unavailable or its reserve binding is invalid: unrelated reason"}},
      {...settlement,payload:{...settlement.payload,intentId:"another-funding"}},
      {...settlement,payload:{...settlement.payload,paymentId:"changed-payment"}},
      {...settlement,id:"another-settlement"},
    ]) assert.throws(()=>snapshotRetryPatch(changed,funding,3,"test"));

    const response = await POST(request("isolated-test-credential"));
    assert.equal(response.status, 200);
    assert.deepEqual(response.data, {id,status:"RECEIVED",stateVersion:4});
    const after = (await workCollection.doc(id).get()).data();
    assert.deepEqual(after.payload, settlement.payload);
    assert.equal(after.payloadCommitment, settlement.payloadCommitment);
    assert.deepEqual(after.retryHistory[0].rejection, settlement.verification);
    assert.equal(after.verification, null);
    assert.deepEqual((await workCollection.doc(funding.id).get()).data(), funding);
    assert.deepEqual(wakes,["SETTLEMENT_SNAPSHOT_RETRY"]);
    assert.equal((await POST(request("isolated-test-credential"))).status,409);
    assert.equal(wakes.length,1);
    const disk = JSON.parse(await readFile(process.env.TSN_RECEIVER_LOCAL_FILE,"utf8"));
    assert.equal(disk.tsn_receiver_work[id].stateVersion,4);
    assert.deepEqual(disk.tsn_receiver_work[funding.id],funding);

    // A later Node verification may hit the repaired asset-layout preflight.
    // Only that exact rejection is retryable; prior history and funding remain.
    const assetRejection = { reason: "TCAP settlement asset is unavailable or its reserve binding is invalid",
      nodeAttestation: { signatureBase64: "mock-asset-rejection-attestation" } };
    await db.runTransaction(async transaction => {
      await transaction.get(workCollection.doc(id));
      transaction.update(workCollection.doc(id), { status:"REJECTED", stateVersion:6, verification:assetRejection });
    });
    assert.equal((await POST(request("isolated-test-credential", {id,expectedVersion:4}))).status,409);
    assert.equal(wakes.length,1);
    const assetResponse = await POST(request("isolated-test-credential", {id,expectedVersion:6}));
    assert.deepEqual(assetResponse.data,{id,status:"RECEIVED",stateVersion:7});
    const assetAfter = (await workCollection.doc(id).get()).data();
    assert.deepEqual(assetAfter.payload,settlement.payload);
    assert.equal(assetAfter.payloadCommitment,settlement.payloadCommitment);
    assert.deepEqual(assetAfter.retryHistory[0],after.retryHistory[0]);
    assert.deepEqual(assetAfter.retryHistory[1].rejection,assetRejection);
    assert.equal(assetAfter.retryHistory[1].rejectedStateVersion,6);
    assert.equal(assetAfter.retryHistory[1].fundingSignature,funding.result.signature);
    for (const field of ["verification","nodeLease","crankerLease","authorization"]) assert.equal(assetAfter[field],null);
    assert.deepEqual((await workCollection.doc(funding.id).get()).data(),funding);
    assert.deepEqual(wakes,["SETTLEMENT_SNAPSHOT_RETRY","SETTLEMENT_SNAPSHOT_RETRY"]);
    assert.equal((await POST(request("isolated-test-credential", {id,expectedVersion:6}))).status,409);
  } finally {
    if (previousFile===undefined) delete process.env.TSN_RECEIVER_LOCAL_FILE; else process.env.TSN_RECEIVER_LOCAL_FILE=previousFile;
    if (previousKey===undefined) delete process.env.TSN_RECEIVER_NODE_API_KEY; else process.env.TSN_RECEIVER_NODE_API_KEY=previousKey;
    await rm(directory,{recursive:true,force:true});
  }
});
