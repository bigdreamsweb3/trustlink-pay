import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

test("native Cranker leases cover both authorization passes and expire without replacing signed work", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-native-lease-"));
  const previous = process.env.TSN_RECEIVER_LOCAL_FILE, realNow = Date.now;
  let clock = realNow();
  process.env.TSN_RECEIVER_LOCAL_FILE = path.join(directory, "store.json");
  try {
    for (const name of ["local-firestore", "work-contract", "settlement-retry", "native-work-retry", "store"]) {
      const source = await readFile(new URL("../lib/" + name + ".ts", import.meta.url), "utf8");
      const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
        .replace(/from "\.\/([^".]+)"/g, 'from "./$1.mjs"').replace('from "firebase-admin/firestore"', 'from "./firestore-stub.mjs"');
      await writeFile(path.join(directory, name + ".mjs"), compiled);
    }
    for (const [name, source] of Object.entries({
      firebase: 'import {localDb} from "./local-firestore.mjs"; export const db=localDb; export const workCollection=db.collection("tsn_receiver_work");',
      "firestore-stub": "export const FieldPath={}; export const Timestamp={};",
      "node-envelope": "export const decryptPayloadForNode=x=>x; export const encryptPayloadForNode=x=>x;",
      "node-verification": "export const assertNodeVerificationAttestation=()=>{};",
      "node-wake": "export const wakeTsnNode=async()=>{};",
      "cranker-wake": "export const publishCrankerWake=async()=>{};"
    })) await writeFile(path.join(directory, name + ".mjs"), source);
    const load = name => import(pathToFileURL(path.join(directory, name + ".mjs")).href);
    const { workCollection } = await load("firebase"), { createReceivedWork } = await load("work-contract");
    const { leaseForCranker, leaseForNode, attachCrankerAuthorization, recordSettlementSubmission, retryLeasedSettlementFundingRoot } = await load("store");
    Date.now = () => clock;
    const funding = { ...createReceivedWork({id:"funding",kind:"AUTHORIZED_FUNDING",payload:{}}), status:"CONFIRMED", result:{signature:"confirmed-deposit"} };
    await workCollection.doc(funding.id).create(funding);
    for (const [kind, type, duration] of [
      ["TCAP_FUNDING_POOL", "TSN_TCAP_FUNDING_POOL_V1", 180000],
      ["TCAP_EPOCH_ACCOUNTING", "TSN_TCAP_EPOCH_ACCOUNTING_V1", 180000],
      ["SETTLEMENT", "TSN_TCAP_GPRU_HIDDEN_HEAD_V1", 180000],
      ["SETTLEMENT", "TSN_CREDITCOIN", 60000], ["AUTHORIZED_FUNDING", "funding", 60000], ["TIN_OPERATION", "tin", 60000]
    ]) {
      const work = { ...createReceivedWork({id:kind+type,kind,payload:kind === "SETTLEMENT" ? {intentId:funding.id} : {}}), status:"VERIFIED", verification:{verificationType:type} };
      await workCollection.doc(work.id).create(work);
      const leased = await leaseForCranker("operator", [kind]);
      assert.equal(leased.id, work.id);
      assert.equal(Date.parse(leased.crankerLease.expiresAt), clock + duration);
    }
    const pool = { ...createReceivedWork({id:"pool-timing",kind:"TCAP_FUNDING_POOL",payload:{root:"synthetic"}}), status:"VERIFIED" };
    await workCollection.doc(pool.id).create(pool);
    let leased = await leaseForCranker("operator", [pool.kind]);
    const started = clock, expiry = leased.crankerLease.expiresAt;
    clock += 34000; // Initial Node authorization consumes part of the same lease.
    leased = await attachCrankerAuthorization({id:pool.id,owner:"operator",expectedVersion:leased.stateVersion,authorization:{
      kind:"TSN_TCAP_COORDINATION_AUTHORIZATION_V1",leaseId:leased.crankerLease.leaseId,
      leaseVersion:leased.crankerLease.version,leaseExpiresAt:expiry,expiresAtTs:Math.floor(Date.parse(expiry)/1000)
    }});
    clock += 34000; // Mother co-signing repeats validation; the old lease has expired.
    assert.ok(clock > started + 60000);
    const evidence = {signature:"1".repeat(87),blockhash:"1".repeat(32),lastValidBlockHeight:"123",
      wireSha256:"a".repeat(64),wireBytes:482,stage:"TCAP_FUNDING_POOL_V1_SIGNED"};
    await recordSettlementSubmission({id:pool.id,owner:"operator",expectedVersion:leased.stateVersion,evidence});
    await assert.rejects(retryLeasedSettlementFundingRoot({id:pool.id,owner:"operator",expectedVersion:leased.stateVersion,requestedBy:"test",reason:"TCAP_POOL_CAPTURE_STALE"}), /EXECUTION_STATE/);
    clock = Date.parse(expiry);
    assert.equal(await leaseForCranker("new-operator", [pool.kind]), null);
    const expired = (await workCollection.doc(pool.id).get()).data();
    assert.equal(expired.status, "FAILED");
    assert.equal(expired.result.signature, evidence.signature);
    assert.deepEqual(expired.authorization, leased.authorization);
    await assert.rejects(recordSettlementSubmission({id:pool.id,owner:"operator",expectedVersion:leased.stateVersion,evidence}), /NOT_LEASED/);
    // Other unsigned native claims return to fresh verification after finite expiry.
    const unsigned = (await workCollection.doc("TCAP_EPOCH_ACCOUNTINGTSN_TCAP_EPOCH_ACCOUNTING_V1").get()).data();
    assert.equal(unsigned.status, "RECEIVED");
    assert.equal(unsigned.crankerLease, null);
    assert.equal((await leaseForNode("node", [unsigned.kind])).id, unsigned.id);
    assert.equal(Date.parse((await workCollection.doc(unsigned.id).get()).data().nodeLease.expiresAt), clock+60000);
    assert.deepEqual((await workCollection.doc(funding.id).get()).data(), funding);
  } finally {
    Date.now = realNow;
    if (previous === undefined) delete process.env.TSN_RECEIVER_LOCAL_FILE; else process.env.TSN_RECEIVER_LOCAL_FILE = previous;
    await rm(directory, {recursive:true,force:true});
  }
});
