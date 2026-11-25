/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { loadReceiverFixtureModule as caseLoad } from "../shared/load-receiver-fixture-module.mjs";
import { readBoxedClock } from "../shared/read-boxed-clock.mjs";
export async function caseNativeCrankerLeasesCoverBothAuthorizationPassesAndExpireWithout() {
    const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-native-lease-"));
    const previous = process.env.TSN_RECEIVER_LOCAL_FILE, realNow = Date.now;
    let clock = { value: realNow() };
    process.env.TSN_RECEIVER_LOCAL_FILE = path.join(directory, "store.json");
    try {
        await compileReceiverFixture(directory, ["local-json-store.ts", "work-contract.ts", "settlement-retry.ts", "native-work-retry.ts", "node-authorizations.ts", "store.ts"]);
        for (const [name, source] of Object.entries({
            database: 'import {localDb} from "./local-json-store.mjs"; export const db=localDb; export const workCollection=db.collection("tsn_receiver_work");',
            "firestore-stub": "export const FieldPath={}; export const Timestamp={};",
            "node-envelope": "export const decryptPayloadForNode=x=>x; export const encryptPayloadForNode=x=>x;",
            "node-verification": "export const assertNodeVerificationAttestation=()=>{};",
            "node-wake": "export const wakeTsnNode=async()=>{};",
            "cranker-wake": "export const publishCrankerWake=async()=>{};"
        }))
            await writeFile(path.join(directory, name + ".mjs"), source);
        const load = caseLoad.bind(null, directory);
        const { workCollection } = await load("database"), { createReceivedWork } = await load("work-contract");
        const { leaseForCranker, leaseForNode, attachCrankerAuthorization, recordSettlementSubmission, retryLeasedSettlementFundingRoot } = await load("store");
        Date.now = readBoxedClock.bind(null, clock);
        const funding = { ...createReceivedWork({ id: "funding", kind: "AUTHORIZED_FUNDING", payload: {} }), status: "CONFIRMED", result: { signature: "confirmed-deposit" } };
        await workCollection.doc(funding.id).create(funding);
        for (const [kind, type, duration] of [
            ["TCAP_EPOCH_ACCOUNTING", "TSN_TCAP_EPOCH_ACCOUNTING_V1", 180000],
            ["SETTLEMENT", "TSN_TCAP_GPRU_HIDDEN_HEAD_V1", 180000],
            ["SETTLEMENT", "TSN_UNSUPPORTED_EXTERNAL", 60000], ["AUTHORIZED_FUNDING", "funding", 60000], ["TIN_OPERATION", "tin", 60000]
        ]) {
            const work = { ...createReceivedWork({ id: kind + type, kind, payload: kind === "SETTLEMENT" ? { intentId: funding.id } : {} }), status: "VERIFIED", verification: { verificationType: type } };
            await workCollection.doc(work.id).create(work);
            const leased = await leaseForCranker("operator", [kind]);
            assert.equal(leased.id, work.id);
            assert.equal(Date.parse(leased.crankerLease.expiresAt), clock.value + duration);
        }
        const epoch = { ...createReceivedWork({ id: "epoch-timing", kind: "TCAP_EPOCH_ACCOUNTING", payload: { accountingEpoch: "synthetic" } }), status: "VERIFIED" };
        await workCollection.doc(epoch.id).create(epoch);
        let leased = await leaseForCranker("operator", [epoch.kind]);
        const started = clock.value, expiry = leased.crankerLease.expiresAt;
        clock.value += 34000; // Initial Node authorization consumes part of the same lease.
        leased = await attachCrankerAuthorization({ id: epoch.id, owner: "operator", expectedVersion: leased.stateVersion, authorization: {
                kind: "TSN_TCAP_COORDINATION_AUTHORIZATION_V1", leaseId: leased.crankerLease.leaseId,
                leaseVersion: leased.crankerLease.version, leaseExpiresAt: expiry, expiresAtTs: Math.floor(Date.parse(expiry) / 1000)
            } });
        clock.value += 34000; // Mother co-signing repeats validation; the old lease has expired.
        assert.ok(clock.value > started + 60000);
        const evidence = { signature: "1".repeat(87), blockhash: "1".repeat(32), lastValidBlockHeight: "123",
            wireSha256: "a".repeat(64), wireBytes: 482, stage: "TCAP_EPOCH_ACCOUNTING_V1_SIGNED" };
        await recordSettlementSubmission({ id: epoch.id, owner: "operator", expectedVersion: leased.stateVersion, evidence });
        await assert.rejects(retryLeasedSettlementFundingRoot({ id: epoch.id, owner: "operator", expectedVersion: leased.stateVersion, requestedBy: "test", reason: "TCAP_EPOCH_ALREADY_ACCOUNTED" }), /EXECUTION_STATE/);
        clock.value = Date.parse(expiry);
        assert.equal(await leaseForCranker("new-operator", [epoch.kind]), null);
        const expired = (await workCollection.doc(epoch.id).get()).data();
        assert.equal(expired.status, "FAILED");
        assert.equal(expired.result.signature, evidence.signature);
        assert.deepEqual(expired.authorization, leased.authorization);
        await assert.rejects(recordSettlementSubmission({ id: epoch.id, owner: "operator", expectedVersion: leased.stateVersion, evidence }), /NOT_LEASED/);
        // Other unsigned native claims return to fresh verification after finite expiry.
        const unsigned = (await workCollection.doc("TCAP_EPOCH_ACCOUNTINGTSN_TCAP_EPOCH_ACCOUNTING_V1").get()).data();
        assert.equal(unsigned.status, "RECEIVED");
        assert.equal(unsigned.crankerLease, null);
        assert.equal((await leaseForNode("node", [unsigned.kind])).id, unsigned.id);
        assert.equal(Date.parse((await workCollection.doc(unsigned.id).get()).data().nodeLease.expiresAt), clock.value + 60000);
        assert.deepEqual((await workCollection.doc(funding.id).get()).data(), funding);
    }
    finally {
        Date.now = realNow;
        if (previous === undefined)
            delete process.env.TSN_RECEIVER_LOCAL_FILE;
        else
            process.env.TSN_RECEIVER_LOCAL_FILE = previous;
        await rm(directory, { recursive: true, force: true });
    }
}
