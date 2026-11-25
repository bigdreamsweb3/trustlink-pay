import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadComponent } from "./load-component.mjs";
import { runTransactionCase } from "./run-transaction-case.mjs";
import { runTransactionCase4 } from "./run-transaction-case4.mjs";
import { throwsCase } from "./throws-case.mjs";
import { throwsCase6 } from "./throws-case6.mjs";
import { throwsCase7 } from "./throws-case7.mjs";
import { throwsCase8 } from "./throws-case8.mjs";
import { throwsCase9 } from "./throws-case9.mjs";
import { throwsCase10 } from "./throws-case10.mjs";
import { throwsCase11 } from "./throws-case11.mjs";
import { runTransactionCase12 } from "./run-transaction-case12.mjs";
import { runTransactionCase13 } from "./run-transaction-case13.mjs";
import { currentSyntheticTime } from "./current-synthetic-time.mjs";

export async function verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodes() {
    const verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext = {};
    verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.directory = await mkdtemp(path.join(os.tmpdir(), "tsn-private-coordination-"));
    const previous = process.env.TSN_RECEIVER_LOCAL_FILE;
    process.env.TSN_RECEIVER_LOCAL_FILE = path.join(verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.directory, "store.json");
    const realNow = Date.now;
    Date.now = currentSyntheticTime.bind(null, realNow());
    try {
        await compileReceiverFixture(verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.directory, ["local-json-store.ts", "work-contract.ts", "settlement-retry.ts", "native-work-retry.ts", "store.ts", "private-credit-coordination.ts"]);
        for (const [name, source] of Object.entries({
            database: 'import {localDb} from "./local-json-store.mjs";export const db=localDb;export const workCollection=db.collection("tsn_receiver_work");',
            "firestore-stub": "export const FieldPath={};export const Timestamp={};",
            "node-envelope": "export const decryptPayloadForNode=x=>x;export const encryptPayloadForNode=x=>x;",
            "node-verification": "export const assertNodeVerificationAttestation=()=>{};",
            "node-wake": "export const wakeTsnNode=async()=>{};",
            "cranker-wake": "export const publishCrankerWake=async()=>{};"
        }))
            await writeFile(path.join(verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.directory, name + ".mjs"), source);
        const load = loadComponent.bind(null, {
            verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext
        });
        const { workCollection, db } = await load("database");
        verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.workCollection = workCollection;
        const { createReceivedWork } = await load("work-contract");
        verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.createReceivedWork = createReceivedWork;
        const { coordinationInventory, deferPrivateCredit, enqueueCoordination } = await load("private-credit-coordination");
        const { leaseForNode, leaseForCranker } = await load("store");
        const { nativeWorkRetryPatch } = await load("native-work-retry");
        verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.nativeWorkRetryPatch = nativeWorkRetryPatch;
        verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.enqueuedId = "tcap-epoch-" + "a".repeat(64);
        verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.epochId = "tcap-epoch-" + "b".repeat(64);
        const enqueued = { id: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.enqueuedId, kind: "TCAP_EPOCH_ACCOUNTING", payload: { assetEntry: "synthetic-asset", accountingEpoch: "a".repeat(64) } };
        await enqueueCoordination(enqueued);
        await enqueueCoordination(enqueued);
        await db.runTransaction(runTransactionCase.bind(null, {
            verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext
        }));
        await assert.rejects(enqueueCoordination({ ...enqueued, payload: { ...enqueued.payload, accountingEpoch: "b".repeat(64) } }), /IDEMPOTENCY/);
        // More than a full inventory page and fifty deferred works cannot starve fresh work.
        await db.runTransaction(runTransactionCase4.bind(null, {
            verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext
        }));
        const first = await coordinationInventory();
        const second = await coordinationInventory(first.nextCursor);
        assert.equal(first.work.length, 200);
        assert.equal(second.work.length, 12);
        assert.equal(second.nextCursor, null);
        const retired = [];
        for (const status of ["RECEIVED", "VERIFIED", "NODE_VERIFYING", "CRANKER_LEASED"]) {
            const old = { ...verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.createReceivedWork({ id: "retired-" + status, kind: "TCAP_EPOCH_ACCOUNTING", payload: {} }), kind: "TCAP_FUNDING_POOL", status,
                nodeLease: status === "NODE_VERIFYING" ? { owner: "old-node", expiresAt: new Date(0).toISOString() } : null,
                crankerLease: status === "CRANKER_LEASED" ? { owner: "old-cranker", expiresAt: new Date(0).toISOString() } : null };
            await verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.workCollection.doc(old.id).create(old);
            retired.push(old);
        }
        assert.equal(await leaseForNode("retired-request", ["TCAP_FUNDING_POOL"]), null);
        assert.equal(await leaseForCranker("retired-request", ["TCAP_FUNDING_POOL"]), null);
        for (const old of retired)
            assert.deepEqual((await verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.workCollection.doc(old.id).get()).data(), old, "obsolete records remain unleased and unchanged");
        assert.throws(throwsCase.bind(null, {
            verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext
        }), /WORK_KIND_UNSUPPORTED/);
        await assert.rejects(enqueueCoordination({ id: "tcap-pool-" + "c".repeat(64), kind: "TCAP_FUNDING_POOL", payload: {} }), /KIND_INVALID/);
        const claims = await Promise.all([leaseForNode("A", ["TCAP_EPOCH_ACCOUNTING"]), leaseForNode("B", ["TCAP_EPOCH_ACCOUNTING"])]);
        verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.epoch = claims.find(Boolean);
        assert.equal(claims.filter(Boolean).length, 1);
        await deferPrivateCredit({ id: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.epoch.id, owner: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.epoch.nodeLease.owner, expectedVersion: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.epoch.stateVersion, seconds: 1 });
        const deferred = (await verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.workCollection.doc(verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.epoch.id).get()).data();
        assert.equal(deferred.status, "RECEIVED");
        assert.equal(deferred.nodeLease, null);
        await assert.rejects(deferPrivateCredit({ id: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.epoch.id, owner: "wrong", expectedVersion: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.epoch.stateVersion, seconds: 1 }), /LEASE_INVALID/);
        const expiry = new Date(Date.now() + 60000).toISOString();
        verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.leased = { ...deferred, status: "CRANKER_LEASED", crankerLease: { owner: "payer", expiresAt: expiry } };
        assert.equal(verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.nativeWorkRetryPatch(verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.leased, null, verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.leased.stateVersion, "payer", "test", "TCAP_EPOCH_ALREADY_ACCOUNTED").status, "RECEIVED");
        assert.throws(throwsCase6.bind(null, {
            verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext
        }), /EXECUTION_STATE/);
        const lifetimeReason = "TCAP_TRANSACTION_BLOCKHASH_TOO_OLD_FOR_SUBMISSION";
        for (const reason of [lifetimeReason, "TSN_NODE_SIGNING_SERVICE_UNAVAILABLE"]) {
            verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.reason = reason;
            for (const kind of ["TCAP_EPOCH_ACCOUNTING"]) {
                verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.native = { ...verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.leased, kind };
                const patch = verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.nativeWorkRetryPatch(verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.native, null, verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.native.stateVersion, "payer", "test", verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.reason);
                assert.equal(patch.status, "RECEIVED");
                assert.equal(patch.retryHistory.at(-1).reason, verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.reason);
                assert.equal(patch.stateVersion, verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.native.stateVersion + 1);
                for (const field of ["verification", "authorization", "nodeLease", "crankerLease", "result"])
                    assert.equal(patch[field], null);
                assert.throws(throwsCase7.bind(null, {
                    verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext
                }), /EXECUTION_STATE/);
                assert.throws(throwsCase8.bind(null, {
                    verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext
                }), /STALE_STATE_VERSION/);
                assert.throws(throwsCase9.bind(null, {
                    verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext
                }), /LEASE_INVALID/);
                assert.throws(throwsCase10.bind(null, {
                    verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext
                }), /LEASE_INVALID/);
                assert.throws(throwsCase11.bind(null, {
                    verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext
                }), /REASON_NOT_ALLOWED/);
            }
        }
        verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.funding = { ...verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.createReceivedWork({ id: "funding", kind: "AUTHORIZED_FUNDING", payload: {} }), status: "CONFIRMED" };
        verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.credit = verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.createReceivedWork({ id: "credit", kind: "SETTLEMENT", payload: { intentId: "funding" } });
        await db.runTransaction(runTransactionCase12.bind(null, {
            verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext
        }));
        assert.equal(await leaseForNode("C", ["SETTLEMENT"]), null, "uncertain signed accounting holds global root lock");
        await db.runTransaction(runTransactionCase13.bind(null, {
            verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext: verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext
        }));
        assert.equal((await leaseForNode("C", ["SETTLEMENT"])).id, "credit");
    }
    finally {
        Date.now = realNow;
        if (previous === undefined)
            delete process.env.TSN_RECEIVER_LOCAL_FILE;
        else
            process.env.TSN_RECEIVER_LOCAL_FILE = previous;
        await rm(verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodesContext.directory, { recursive: true, force: true });
    }
}
