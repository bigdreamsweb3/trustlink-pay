/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { loadReceiverFixtureModule } from "../shared/load-receiver-fixture-module.mjs";
import { caseRequest } from "./request.mjs";
import { retryChangedFunding } from "./retry-changed-funding.mjs";
import { retryChangedSnapshot } from "./retry-changed-snapshot.mjs";
import { writeAssetRejection } from "./write-asset-rejection.mjs";
import { retryUnconfirmedFunding } from "./retry-unconfirmed-funding.mjs";
import { retryStaleSnapshotVersion } from "./retry-stale-snapshot-version.mjs";
import { writeMemoRejection } from "./write-memo-rejection.mjs";
import { retryUnrecognizedFundingReason } from "./retry-unrecognized-funding-reason.mjs";
import { retryStaleFundingLeaseVersion } from "./retry-stale-funding-lease-version.mjs";
import { retryWrongFundingLeaseOwner } from "./retry-wrong-funding-lease-owner.mjs";
import { retryChangedLeasedWork } from "./retry-changed-leased-work.mjs";
import { retryChangedFundingPayload } from "./retry-changed-funding-payload.mjs";
import { retryLeasedUnconfirmedFunding } from "./retry-leased-unconfirmed-funding.mjs";
import { writeLeasedSettlement } from "./write-leased-settlement.mjs";
import { caseCrankerrequest } from "./crankerrequest.mjs";
import { writeVerifiedSettlement } from "./write-verified-settlement.mjs";
import { fundingRootConflictResponse } from "./funding-root-conflict-response.mjs";
import { unavailableSigningResponse } from "./unavailable-signing-response.mjs";
import { restoreEpochWork } from "./restore-epoch-work.mjs";
import { missingWorkResponse } from "./missing-work-response.mjs";
import { writeEpochAttempt } from "./write-epoch-attempt.mjs";
import { failedSigningResponse } from "./failed-signing-response.mjs";
export async function caseRepairedSettlementRetryIsAuthenticatedVersionedFundedAndPreserve() {
    const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-settlement-retry-"));
    const previousFile = process.env.TSN_RECEIVER_LOCAL_FILE;
    const previousKey = process.env.TSN_RECEIVER_NODE_API_KEY;
    const previousPin = process.env.TSN_NODE_VERIFICATION_PUBLIC_KEY;
    process.env.TSN_NODE_VERIFICATION_PUBLIC_KEY = "synthetic-pin";
    process.env.TSN_RECEIVER_LOCAL_FILE = path.join(directory, "receiver.json");
    process.env.TSN_RECEIVER_NODE_API_KEY = "isolated-test-credential";
    try {
        await compileReceiverFixture(directory, ["work-contract.ts", "settlement-retry.ts", "native-work-retry.ts", "node-authorizations.ts", "local-json-store.ts", "store.ts", "auth.ts"], { routes: [{ path: "app/api/internal/node/work/retry/route.ts", output: "route" }, { path: "app/api/cranker/work/retry/route.ts", output: "cranker-retry-route" }, { path: "app/api/cranker/work/route.ts", output: "cranker-work-route" }] });
        await writeFile(path.join(directory, "firestore-stub.mjs"), "export const FieldPath = {}; export const Timestamp = {};");
        await writeFile(path.join(directory, "database.mjs"), 'import {localDb} from "./local-json-store.mjs"; export const db=localDb; export const workCollection=db.collection("tsn_receiver_work");');
        await writeFile(path.join(directory, "node-envelope.mjs"), "export const decryptPayloadForNode = x=>x; export const encryptPayloadForNode = x=>x;");
        await writeFile(path.join(directory, "node-verification.mjs"), "export const assertNodeVerificationAttestation = ()=>{};");
        await writeFile(path.join(directory, "settlement-reconciliation.mjs"), "export const reconcileExpiredCrankerConfirmation=async()=>{throw new Error('Unexpected late receipt report')};");
        await writeFile(path.join(directory, "node-relay/request.mjs"), 'export const requestLocalNode=async (_,request)=>globalThis.fetch("https://isolated-relay.invalid"+request.path,{method:request.method,body:request.body});');
        await writeFile(path.join(directory, "node-wake.mjs"), "export const wakes=[]; export const wakeTsnNode=async reason=>{wakes.push(reason)};");
        await writeFile(path.join(directory, "cranker-wake.mjs"), "export const publishCrankerWake = async ()=>{};");
        await writeFile(path.join(directory, "next-stub.mjs"), "export class NextResponse { constructor(body, options={}) { this.status=options.status??200; this.data=JSON.parse(body); } static json(data, options={}) { return {status:options.status??200,data}; } }");
        await writeFile(path.join(directory, "cranker-auth.mjs"), 'export async function authenticateCrankerRequest(request) { const owner=request.headers.get("x-test-cranker"); if (!owner) throw new Error("CRANKER_SESSION_INVALID"); return owner; } export async function enforceCrankerLeaseRateLimit() {}');
        const load = loadReceiverFixtureModule.bind(null, directory);
        const { workCollection, db } = await load("database");
        const { createReceivedWork } = await load("work-contract");
        const { snapshotRetryPatch, fundedRootRetryPatch, FUNDED_ROOT_STALE } = await load("settlement-retry");
        const { POST } = await load("route");
        const { POST: crankerRetry } = await load("cranker-retry-route");
        const { POST: crankerLease } = await load("cranker-work-route");
        const { wakes } = await load("node-wake");
        const originalNote = { version: 1, secret: "01".repeat(32), blinding: "02".repeat(32), commitment: "03".repeat(32) };
        const funding = { ...createReceivedWork({ id: "mock-funding", kind: "AUTHORIZED_FUNDING", payload: { paymentId: "mock-payment", recipientHash: "mock-owner", nodeEncryptedPayload: { fundingNote: originalNote } } }), status: "CONFIRMED", stateVersion: 5, result: { signature: "mock-confirmed-deposit-signature" } };
        const id = `settlement-${createHash("sha256").update(`${funding.id}:${funding.payloadCommitment}`).digest("hex").slice(0, 32)}`;
        const settlement = { ...createReceivedWork({ id, kind: "SETTLEMENT", payload: { paymentId: "mock-payment", intentId: funding.id, source: "tsn-receiver-at-ingress" } }), status: "REJECTED", stateVersion: 3, verification: { reason: "GPRU_HIDDEN_HEAD_WITNESS_UNAVAILABLE: no snapshot for the chain-selected root", nodeAttestation: { signatureBase64: "mock-rejection-attestation" } } };
        await workCollection.doc(funding.id).create(funding);
        await workCollection.doc(id).create(settlement);
        const request = caseRequest.bind(null, id);
        assert.equal((await POST(request("incorrect"))).status, 401);
        assert.equal((await POST(request("isolated-test-credential", { id, expectedVersion: 2 }))).status, 409);
        assert.equal((await POST(request("isolated-test-credential", { id, expectedVersion: "3" }))).status, 400);
        assert.deepEqual((await workCollection.doc(id).get()).data(), settlement);
        assert.equal(wakes.length, 0);
        for (const changed of [
            { ...funding, status: "CRANKER_LEASED" }, { ...funding, result: {} },
        ])
            assert.throws(retryChangedFunding.bind(null, snapshotRetryPatch, settlement, changed), /FUNDING_NOT_CONFIRMED/);
        for (const changed of [
            { ...settlement, status: "CONFIRMED" }, { ...settlement, kind: "AUTHORIZED_FUNDING" },
            { ...settlement, verification: { reason: "bad proof" } }, { ...settlement, result: { signature: "ambiguous-execution" } },
            { ...settlement, nodeLease: { leaseId: "active-node-lease" } }, { ...settlement, crankerLease: { leaseId: "active-cranker-lease" } },
            { ...settlement, authorization: { signature: "existing-authorization" } }, { ...settlement, result: { error: "ambiguous-submission" } },
            { ...settlement, verification: { reason: "TCAP settlement reserve lacks funded pending liabilities or is insolvent" } },
            { ...settlement, verification: { reason: "TCAP settlement asset is unavailable or its reserve binding is invalid: unrelated reason" } },
            { ...settlement, payload: { ...settlement.payload, intentId: "another-funding" } },
            { ...settlement, payload: { ...settlement.payload, paymentId: "changed-payment" } },
            { ...settlement, id: "another-settlement" },
        ])
            assert.throws(retryChangedSnapshot.bind(null, snapshotRetryPatch, changed, funding));
        const response = await POST(request("isolated-test-credential"));
        assert.equal(response.status, 200);
        assert.deepEqual(response.data, { id, status: "RECEIVED", stateVersion: 4 });
        const after = (await workCollection.doc(id).get()).data();
        assert.deepEqual(after.payload, settlement.payload);
        assert.equal(after.payloadCommitment, settlement.payloadCommitment);
        assert.deepEqual(after.retryHistory[0].rejection, settlement.verification);
        assert.equal(after.verification, null);
        assert.deepEqual((await workCollection.doc(funding.id).get()).data(), funding);
        assert.deepEqual(wakes, ["SETTLEMENT_SNAPSHOT_RETRY"]);
        assert.equal((await POST(request("isolated-test-credential"))).status, 409);
        assert.equal(wakes.length, 1);
        const disk = JSON.parse(await readFile(process.env.TSN_RECEIVER_LOCAL_FILE, "utf8"));
        assert.equal(JSON.parse(await readFile(path.join(`${process.env.TSN_RECEIVER_LOCAL_FILE}.d`, disk.collections.tsn_receiver_work[id]), "utf8")).stateVersion, 4);
        assert.deepEqual(JSON.parse(await readFile(path.join(`${process.env.TSN_RECEIVER_LOCAL_FILE}.d`, disk.collections.tsn_receiver_work[funding.id]), "utf8")), funding);
        // A later Node verification may hit the repaired asset-layout preflight.
        // Only that exact rejection is retryable; prior history and funding remain.
        const assetRejection = { reason: "TCAP settlement asset is unavailable or its reserve binding is invalid",
            nodeAttestation: { signatureBase64: "mock-asset-rejection-attestation" } };
        await db.runTransaction(writeAssetRejection.bind(null, workCollection, id, assetRejection));
        assert.equal((await POST(request("isolated-test-credential", { id, expectedVersion: 4 }))).status, 409);
        assert.equal(wakes.length, 1);
        const assetResponse = await POST(request("isolated-test-credential", { id, expectedVersion: 6 }));
        assert.deepEqual(assetResponse.data, { id, status: "RECEIVED", stateVersion: 7 });
        const assetAfter = (await workCollection.doc(id).get()).data();
        assert.deepEqual(assetAfter.payload, settlement.payload);
        assert.equal(assetAfter.payloadCommitment, settlement.payloadCommitment);
        assert.deepEqual(assetAfter.retryHistory[0], after.retryHistory[0]);
        assert.deepEqual(assetAfter.retryHistory[1].rejection, assetRejection);
        assert.equal(assetAfter.retryHistory[1].rejectedStateVersion, 6);
        assert.equal(assetAfter.retryHistory[1].fundingSignature, funding.result.signature);
        for (const field of ["verification", "nodeLease", "crankerLease", "authorization"])
            assert.equal(assetAfter[field], null);
        assert.deepEqual((await workCollection.doc(funding.id).get()).data(), funding);
        assert.deepEqual(wakes, ["SETTLEMENT_SNAPSHOT_RETRY", "SETTLEMENT_SNAPSHOT_RETRY"]);
        assert.equal((await POST(request("isolated-test-credential", { id, expectedVersion: 6 }))).status, 409);
        // The former twelve-input Memo validator rejected current funded-note proofs.
        // Recover only that exact stored error; fresh Node verification remains mandatory.
        const memoRejection = { reason: "GPRU transaction record is missing its twelve public hidden-head inputs" };
        const memoRejected = { ...settlement, verification: memoRejection };
        for (const changed of [
            { ...memoRejected, result: { signature: "possibly-broadcast" } },
            { ...memoRejected, authorization: { signature: "existing" } },
            { ...memoRejected, nodeLease: { leaseId: "active" } },
            { ...memoRejected, crankerLease: { leaseId: "active" } },
            { ...memoRejected, verification: { reason: memoRejection.reason + ": unrelated" } },
            { ...memoRejected, verification: { reason: "GPRU transaction record requires exactly thirteen public hidden-head inputs" } },
        ])
            assert.throws(retryChangedSnapshot.bind(null, snapshotRetryPatch, changed, funding));
        assert.throws(retryUnconfirmedFunding.bind(null, snapshotRetryPatch, memoRejected, funding), /FUNDING_NOT_CONFIRMED/);
        assert.throws(retryStaleSnapshotVersion.bind(null, snapshotRetryPatch, memoRejected, funding), /STALE_STATE_VERSION/);
        await db.runTransaction(writeMemoRejection.bind(null, workCollection, id, memoRejection));
        assert.equal((await POST(request("incorrect", { id, expectedVersion: 8 }))).status, 401);
        const memoResponse = await POST(request("isolated-test-credential", { id, expectedVersion: 8 }));
        assert.deepEqual(memoResponse.data, { id, status: "RECEIVED", stateVersion: 9 });
        const memoAfter = (await workCollection.doc(id).get()).data();
        assert.deepEqual(memoAfter.payload, settlement.payload);
        assert.equal(memoAfter.payloadCommitment, settlement.payloadCommitment);
        assert.deepEqual(memoAfter.retryHistory.slice(0, 2), assetAfter.retryHistory);
        assert.deepEqual(memoAfter.retryHistory.at(-1).rejection, memoRejection);
        assert.equal(memoAfter.retryHistory.at(-1).fundingSignature, funding.result.signature);
        for (const field of ["verification", "nodeLease", "crankerLease", "authorization"])
            assert.equal(memoAfter[field], null);
        assert.deepEqual((await workCollection.doc(funding.id).get()).data(), funding);
        assert.equal((await POST(request("isolated-test-credential", { id, expectedVersion: 8 }))).status, 409);
        const staleRejection = { ...settlement, verification: { reason: FUNDED_ROOT_STALE } };
        assert.equal(snapshotRetryPatch(staleRejection, funding, 3, "test").status, "RECEIVED");
        assert.throws(retryUnrecognizedFundingReason.bind(null, snapshotRetryPatch, staleRejection, FUNDED_ROOT_STALE, funding), /REASON_NOT_ALLOWED/);
        const transition = { fundingRootAccount: "mock-canonical-root", nullifier: "04".repeat(32), proof: { publicInputs: Array(13).fill("05".repeat(32)) } };
        const leased = { ...settlement, status: "CRANKER_LEASED", stateVersion: 9, retryHistory: memoAfter.retryHistory,
            verification: { verificationType: "TSN_TCAP_GPRU_HIDDEN_HEAD_V1", payloadDelta: { addedFields: { tcapCreditTransition: transition }, changedFields: {}, removedFields: [] } },
            crankerLease: { owner: "mock-cranker", leaseId: id, version: 8, expiresAt: new Date(Date.now() + 60000).toISOString() },
            authorization: { kind: "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3", transition }, result: null };
        const retryPatch = fundedRootRetryPatch(leased, funding, 9, "mock-cranker", "test");
        assert.equal(retryPatch.status, "RECEIVED");
        assert.equal(retryPatch.retryHistory.at(-1).reason, FUNDED_ROOT_STALE);
        assert.throws(retryStaleFundingLeaseVersion.bind(null, fundedRootRetryPatch, leased, funding), /STALE_STATE_VERSION/);
        assert.throws(retryWrongFundingLeaseOwner.bind(null, fundedRootRetryPatch, leased, funding), /LEASE_INVALID/);
        for (const changed of [
            { ...leased, status: "VERIFIED" }, { ...leased, status: "SUBMITTED" }, { ...leased, status: "CONFIRMED" },
            { ...leased, crankerLease: null },
            { ...leased, crankerLease: { ...leased.crankerLease, expiresAt: new Date(Date.now() - 1000).toISOString() } },
            { ...leased, crankerLease: { ...leased.crankerLease, expiresAt: "invalid" } },
            { ...leased, nodeLease: { owner: "another-node", expiresAt: new Date(Date.now() + 60000).toISOString() } },
            { ...leased, result: { signature: "durable-possibly-broadcast-signature" } },
            { ...leased, result: { reason: "ambiguous-execution" } },
            { ...leased, verification: { verificationType: "TSN_UNSUPPORTED_EXTERNAL_PAYOUT", verifiedPayload: { tcapCreditTransition: transition } } },
            { ...leased, verification: { verificationType: "TSN_TCAP_GPRU_HIDDEN_HEAD_V1", verifiedPayload: { tcapCreditTransition: { ...transition, fundingRootAccount: undefined } } } },
            { ...leased, verification: { verificationType: "TSN_TCAP_GPRU_HIDDEN_HEAD_V1", verifiedPayload: { tcapCreditTransition: { ...transition, proof: { publicInputs: Array(12) } } } } },
            { ...leased, payload: { ...leased.payload, intentId: "another-funding" } },
            { ...leased, id: "another-settlement" },
        ])
            assert.throws(retryChangedLeasedWork.bind(null, fundedRootRetryPatch, changed, funding));
        const changedPayload = { ...leased.payload, paymentId: "another-payment" };
        const { payloadCommitment } = await load("work-contract");
        assert.throws(retryChangedFundingPayload.bind(null, fundedRootRetryPatch, leased, changedPayload, payloadCommitment, funding), /REFERENCE_MISMATCH/);
        assert.throws(retryLeasedUnconfirmedFunding.bind(null, fundedRootRetryPatch, leased, funding), /FUNDING_NOT_CONFIRMED/);
        await db.runTransaction(writeLeasedSettlement.bind(null, workCollection, id, leased));
        const crankerRequest = caseCrankerrequest.bind(null, id, FUNDED_ROOT_STALE);
        assert.equal((await crankerRetry(crankerRequest(null))).status, 401);
        assert.equal((await crankerRetry(crankerRequest("another-cranker"))).status, 409);
        assert.equal((await crankerRetry(crankerRequest("mock-cranker", { id, expectedVersion: 9, reason: "bad proof" }))).status, 400);
        assert.equal((await crankerRetry(crankerRequest("mock-cranker", { id, expectedVersion: 8, reason: FUNDED_ROOT_STALE }))).status, 409);
        assert.deepEqual((await workCollection.doc(id).get()).data(), leased);
        assert.deepEqual((await crankerRetry(crankerRequest("mock-cranker"))).data, { id, status: "RECEIVED", stateVersion: 10 });
        const requeued = (await workCollection.doc(id).get()).data();
        assert.deepEqual(requeued.payload, settlement.payload);
        assert.equal(requeued.payloadCommitment, settlement.payloadCommitment);
        for (const field of ["verification", "nodeLease", "crankerLease", "authorization"])
            assert.equal(requeued[field], null);
        assert.equal(requeued.retryHistory.at(-1).reason, FUNDED_ROOT_STALE);
        assert.deepEqual(requeued.retryHistory.slice(0, -1), memoAfter.retryHistory);
        assert.deepEqual((await workCollection.doc(funding.id).get()).data(), funding);
        const { getWorkForNode, leaseForNode } = await load("store");
        assert.deepEqual((await getWorkForNode(funding.id)).payload.fundingNote, originalNote);
        const freshLease = await leaseForNode("fresh-node", ["SETTLEMENT"]);
        assert.equal(freshLease.status, "NODE_VERIFYING");
        assert.equal(freshLease.stateVersion, 11);
        assert.equal(freshLease.verification, null);
        assert.equal(freshLease.payload.intentId, funding.id);
        // Authorization-time changes recover before a stale proof reaches Cranker.
        const previousFetch = globalThis.fetch;
        try {
            await db.runTransaction(writeVerifiedSettlement.bind(null, workCollection, id, leased));
            globalThis.fetch = fundingRootConflictResponse.bind(null, FUNDED_ROOT_STALE);
            const automatic = await crankerLease(crankerRequest("mock-cranker", { supportedKinds: ["SETTLEMENT"] }));
            assert.equal(automatic.status, 200);
            assert.deepEqual(automatic.data, { work: null, requeued: { id, status: "RECEIVED", stateVersion: 22 } });
            assert.deepEqual((await workCollection.doc(funding.id).get()).data(), funding);
            assert.deepEqual((await getWorkForNode(funding.id)).payload.fundingNote, originalNote);
            assert.deepEqual(wakes, ["SETTLEMENT_SNAPSHOT_RETRY", "SETTLEMENT_SNAPSHOT_RETRY", "SETTLEMENT_SNAPSHOT_RETRY", "SETTLEMENT_FUNDED_ROOT_RETRY", "SETTLEMENT_FUNDED_ROOT_RETRY"]);
            const availabilityReason = "TSN_NODE_SIGNING_SERVICE_UNAVAILABLE";
            const epoch = { ...createReceivedWork({ id: "availability-epoch", kind: "TCAP_EPOCH_ACCOUNTING", payload: { assetEntry: "synthetic-asset", accountingEpoch: "synthetic-epoch" } }),
                status: "VERIFIED", stateVersion: 40, verification: { verificationType: "TSN_TCAP_EPOCH_ACCOUNTING_V1" } };
            await workCollection.doc(epoch.id).create(epoch);
            let calls = { value: 0 };
            globalThis.fetch = unavailableSigningResponse.bind(null, calls);
            const outage = await crankerLease(crankerRequest("mock-cranker", { supportedKinds: [epoch.kind] }));
            assert.deepEqual(outage.data, { work: null, requeued: { id: epoch.id, status: "RECEIVED", stateVersion: 42 } });
            assert.equal(calls.value, 1);
            const retriedEpoch = (await workCollection.doc(epoch.id).get()).data();
            assert.equal(retriedEpoch.retryHistory.at(-1).reason, availabilityReason);
            assert.deepEqual(retriedEpoch.payload, epoch.payload);
            assert.equal(retriedEpoch.payloadCommitment, epoch.payloadCommitment);
            // A domain404 must preserve the leased record for diagnosis, without fallback/requeue.
            await db.runTransaction(restoreEpochWork.bind(null, workCollection, epoch));
            calls.value = 0;
            globalThis.fetch = missingWorkResponse.bind(null, calls);
            const absent = await crankerLease(crankerRequest("mock-cranker", { supportedKinds: [epoch.kind] }));
            assert.equal(absent.status, 404);
            assert.deepEqual(absent.data, { detail: "Receiver work was not found" });
            assert.equal(calls.value, 1);
            const absentEpoch = (await workCollection.doc(epoch.id).get()).data();
            assert.equal(absentEpoch.status, "CRANKER_LEASED");
            assert.equal(absentEpoch.stateVersion, 41);
            assert.equal(absentEpoch.retryHistory.length, retriedEpoch.retryHistory.length);
            // The signing route's exact503 reason can return an unsigned claim to fresh verification.
            const signingRetry = await crankerRetry(crankerRequest("mock-cranker", { id: epoch.id, expectedVersion: 41, reason: availabilityReason }));
            assert.equal(signingRetry.status, 200);
            const unsignedEpoch = (await workCollection.doc(epoch.id).get()).data();
            assert.equal(unsignedEpoch.status, "RECEIVED");
            assert.equal(unsignedEpoch.retryHistory.at(-1).reason, availabilityReason);
            // Even incomplete execution evidence blocks both authorization-time and explicit retries.
            for (const result of [{ signature: "recorded" }, { wireSha256: "uncertain" }, { stage: "checkpoint" }]) {
                await db.runTransaction(writeEpochAttempt.bind(null, workCollection, epoch, result));
                globalThis.fetch = failedSigningResponse;
                const protectedResponse = await crankerLease(crankerRequest("mock-cranker", { supportedKinds: [epoch.kind] }));
                assert.equal(protectedResponse.status, 409);
                assert.match(protectedResponse.data.error, /EXECUTION_STATE/);
                const saved = (await workCollection.doc(epoch.id).get()).data();
                assert.equal(saved.status, "CRANKER_LEASED");
                assert.deepEqual(saved.result, result);
                const refused = await crankerRetry(crankerRequest("mock-cranker", { id: epoch.id, expectedVersion: saved.stateVersion, reason: availabilityReason }));
                assert.equal(refused.status, 409);
                assert.match(refused.data.error, /EXECUTION_STATE/);
            }
            assert.deepEqual((await workCollection.doc(funding.id).get()).data(), funding);
        }
        finally {
            globalThis.fetch = previousFetch;
        }
    }
    finally {
        if (previousFile === undefined)
            delete process.env.TSN_RECEIVER_LOCAL_FILE;
        else
            process.env.TSN_RECEIVER_LOCAL_FILE = previousFile;
        if (previousKey === undefined)
            delete process.env.TSN_RECEIVER_NODE_API_KEY;
        else
            process.env.TSN_RECEIVER_NODE_API_KEY = previousKey;
        if (previousPin === undefined) delete process.env.TSN_NODE_VERIFICATION_PUBLIC_KEY;
        else process.env.TSN_NODE_VERIFICATION_PUBLIC_KEY = previousPin;
        await rm(directory, { recursive: true, force: true });
    }
}
