import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateKeyPairSync } from "node:crypto";
import { sign } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";
import { hash } from "./hash.mjs";
import { b58 } from "./b58.mjs";
import { uint } from "./uint.mjs";
import { mapCase } from "./map-case.mjs";
import { loadComponent } from "./load-component.mjs";
import { pdaComponent } from "./pda-component.mjs";
import { pubComponent } from "./pub-component.mjs";
import { hComponent } from "./h-component.mjs";
import { fromCase } from "./from-case.mjs";
import { filterCase } from "./filter-case.mjs";
import { filterCase12 } from "./filter-case12.mjs";
import { mapCase14 } from "./map-case14.mjs";
import { idxComponent } from "./idx-component.mjs";
import { publicKeyBytes } from "./public-key-bytes.mjs";
import { throwsCase } from "./throws-case.mjs";
import { throwsCase19 } from "./throws-case19.mjs";
import { throwsCase20 } from "./throws-case20.mjs";
import { throwsCase21 } from "./throws-case21.mjs";
import { throwsCase22 } from "./throws-case22.mjs";
import { scalarComponent } from "./scalar-component.mjs";
import { mapCase24 } from "./map-case24.mjs";
import { filterCase25 } from "./filter-case25.mjs";
import { indexComponent } from "./index-component.mjs";
import { makeReceiptComponent } from "./make-receipt-component.mjs";
import { throwsCase31 } from "./throws-case31.mjs";
import { throwsCase32 } from "./throws-case32.mjs";
import { fixtureCallback } from "./fixture-callback.mjs";
import { requestComponent } from "./request-component.mjs";
import { runTransactionCase } from "./run-transaction-case.mjs";
import { expiredCrankerReportTime } from "./expired-cranker-report-time.mjs";
import { resetComponent } from "./reset-component.mjs";
import { reportRequestComponent } from "./report-request-component.mjs";
import { fixtureCallback43 } from "./fixture-callback43.mjs";
import { fixtureCallback44 } from "./fixture-callback44.mjs";
import { fixtureCallback45 } from "./fixture-callback45.mjs";

export async function verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnly() {
    const verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext = {};
    verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.directory = await mkdtemp(path.join(os.tmpdir(), "tsn-receipt-"));
    const names = ["TSN_RECEIVER_LOCAL_FILE", "TSN_RECEIVER_NODE_API_KEY", "TSN_RPC_URL"];
    const previous = Object.fromEntries(names.map(mapCase));
    const realFetch = globalThis.fetch;
    verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.realNow = Date.now;
    process.env.TSN_RECEIVER_LOCAL_FILE = path.join(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.directory, "store.json");
    process.env.TSN_RECEIVER_NODE_API_KEY = "synthetic-receipt-key";
    process.env.TSN_RPC_URL = "https://offline.invalid";
    try {
        await compileReceiverFixture(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.directory, ["work-contract.ts", "settlement-retry.ts", "native-work-retry.ts", "node-authorizations.ts", "settlement-reconciliation.ts", "local-firestore.ts", "store.ts", "auth.ts"], { routes: [
                { path: "app/api/internal/node/work/reconcile/route.ts", output: "route" },
                { path: "app/api/cranker/work/route.ts", output: "cranker-report-route" },
            ] });
        const stubs = { "firestore-stub": "export const FieldPath={};export const Timestamp={};",
            firebase: 'import {localDb} from "./local-firestore.mjs";export const db=localDb;export const workCollection=db.collection("tsn_receiver_work");',
            "node-envelope": "export const decryptPayloadForNode=x=>x;export const encryptPayloadForNode=x=>x;",
            "node-verification": "export const assertNodeVerificationAttestation=()=>{};",
            "node-wake": "export const wakes=[]; export const wakeTsnNode=async reason=>{wakes.push(reason)};",
            "cranker-wake": "export const publishCrankerWake=async()=>{};",
            "next-stub": "export class NextResponse {static json(data,options={}){return {status:options.status??200,data};}}" };
        for (const [name, source] of Object.entries(stubs))
            await writeFile(path.join(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.directory, `${name}.mjs`), source);
        await writeFile(path.join(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.directory, "cranker-auth.mjs"), 'export async function authenticateCrankerRequest(request){const owner=request.headers.get("x-test-cranker");if(!owner)throw new Error("CRANKER_SESSION_INVALID");return owner;} export async function enforceCrankerLeaseRateLimit(){}');
        const load = loadComponent.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        });
        const { wakes } = await load("node-wake");
        const { workCollection, db } = await load("firebase");
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection = workCollection;
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.db = db;
        const { createReceivedWork } = await load("work-contract");
        const { assertSettlementReceipt, reconcileSettlementReceipt, reconcileExpiredCrankerConfirmation } = await load("settlement-reconciliation");
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.assertSettlementReceipt = assertSettlementReceipt;
        const { recordSettlementSubmission, leaseForCranker } = await load("store");
        const { POST } = await load("route");
        const { PATCH: reportConfirmation } = await load("cranker-report-route");
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TSNP = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TCAP = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
        const TIP = new PublicKey("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT");
        const GPRU = new PublicKey("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR");
        const pda = pdaComponent;
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.operatorKey = generateKeyPairSync("ed25519");
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.motherKey = generateKeyPairSync("ed25519");
        const pub = pubComponent;
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payer = pub(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.operatorKey);
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.authority = pub(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.motherKey);
        const funding = { ...createReceivedWork({ id: "synthetic-funding", kind: "AUTHORIZED_FUNDING", payload: { paymentId: "fixture" } }), status: "CONFIRMED", stateVersion: 5, result: { signature: "synthetic-funding-signature" } };
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id = `settlement-${hash(`${funding.id}:${funding.payloadCommitment}`).toString("hex").slice(0, 32)}`;
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.h = hComponent;
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t = { authorizationDigest: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.h(1), validAfterSlot: "1", expiresAtSlot: "500", previousTcapRoot: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.h(2), tcapRootSequence: "1", tokenId: 1, amountCommitment: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.h(8), nullifier: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.h(3),
            tcapConfig: pda("tcap:global-config:v1", verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TCAP).toBase58(), commitmentRoot: pda("tcap:commitment-root:v1", verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TCAP).toBase58(),
            assetEntry: new PublicKey(Buffer.alloc(32, 5)).toBase58(), reserveState: new PublicKey(Buffer.alloc(32, 6)).toBase58(), memoPayload: "synthetic encrypted memo",
            proof: { publicInputs: Array.from({ length: 13 }, fromCase.bind(null, {
                    verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
                })), proofA: "00".repeat(64), proofB: "00".repeat(128), proofC: "00".repeat(64), actionKind: 1, tokenId: 1, amountCommitment: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.h(8), authorizationCommitment: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.h(4) } };
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.fundingRootAccount = pda("tcap:funding-root:v1", verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TCAP).toBase58();
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.accountingEpoch = PublicKey.findProgramAddressSync([Buffer.from("tcap:credit-epoch:v1"), new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.assetEntry).toBuffer(), uint(0, 8)], verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TCAP)[0].toBase58();
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.work = { ...createReceivedWork({ id: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, kind: "SETTLEMENT", payload: { intentId: funding.id, paymentId: "fixture" } }), status: "FAILED", stateVersion: 28,
            authorization: { kind: "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3", transition: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t }, result: { reason: "WebSocket failed to connect" }, retryHistory: [{ rejectedStateVersion: 3 }] };
        const ixKeys = [verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.authority, pda("tsn_mother_escrow", verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TSNP), verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TCAP, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TSNP, new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.tcapConfig), new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.assetEntry), new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.commitmentRoot), new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.reserveState), PublicKey.findProgramAddressSync([Buffer.from("tsn:tcap-authorization:v1"), Buffer.from(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.authorizationDigest, "hex")], verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TSNP)[0], pda("tip:route-merkle-root:v1", TIP), pda("gpru:hidden-head-verifier:v1", GPRU), new PublicKey("Sysvar1nstructions1111111111111111111111111"), GPRU, new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.fundingRootAccount), new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.accountingEpoch), PublicKey.default];
        const memoProgram = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.keys = [verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payer, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.authority, new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.commitmentRoot), new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.accountingEpoch), ...ixKeys.filter(filterCase.bind(null, {
                verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
            })), memoProgram].filter(filterCase12);
        const proof = verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.proof;
        const data = Buffer.concat([hash("global:tsn_register_tcap_credit_authorization_v3").subarray(0, 8), Buffer.from(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.authorizationDigest, "hex"), uint(1, 8), uint(500, 8), Buffer.from(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.previousTcapRoot, "hex"), uint(1, 8), uint(1, 4), Buffer.from(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.amountCommitment, "hex"), Buffer.from(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.nullifier, "hex"), ...proof.publicInputs.map(mapCase14), Buffer.alloc(256), uint(1, 1), uint(1, 4), Buffer.from(proof.amountCommitment, "hex"), Buffer.from(proof.authorizationCommitment, "hex")]);
        const memo = Buffer.from(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.memoPayload);
        const idx = idxComponent.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        });
        const message = Buffer.concat([Buffer.from([0x81, 2, 0, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.keys.length - 4]), uint(12, 4), Buffer.alloc(32), Buffer.from([2, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.keys.length]), ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.keys.map(publicKeyBytes), uint(1400000, 4), uint(64 * 1024 * 1024, 4), Buffer.from([idx(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TSNP), 16]), uint(data.length, 2), Buffer.from([idx(memoProgram), 1]), uint(memo.length, 2), Buffer.from(ixKeys.map(idx)), data, Buffer.from([0]), memo]);
        const payerSig = sign(null, message, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.operatorKey.privateKey);
        const motherSig = sign(null, message, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.motherKey.privateKey);
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature = b58(payerSig);
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.receipt = { version: 1, slot: 100, meta: { err: null }, transaction: [Buffer.concat([message, payerSig, motherSig]).toString("base64"), "base64"] };
        const motherData = Buffer.concat([hash("account:MotherEscrow").subarray(0, 8), verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.authority.toBuffer()]);
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.mother = { owner: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TSNP.toBase58(), data: [motherData.toString("base64"), "base64"] };
        const rootData = Buffer.alloc(124);
        hash("account:TcapCommitmentRootStateV1").copy(rootData, 0, 0, 8);
        Buffer.from(proof.publicInputs[1], "hex").copy(rootData, 12);
        Buffer.from(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.previousTcapRoot, "hex").copy(rootData, 44);
        uint(1, 8).copy(rootData, 80);
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.root = { owner: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TCAP.toBase58(), data: [rootData.toString("base64"), "base64"] };
        assert.equal(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.assertSettlementReceipt(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.work, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.receipt, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.mother, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.root).slot, 100);
        for (const changed of [{ ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.receipt, meta: { err: { InstructionError: [0, 1] } } }, { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.receipt, version: 0 }, { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.receipt, slot: null }]) {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.changed = changed;
            assert.throws(throwsCase.bind(null, {
                verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
            }));
        }
        for (const changed of [{ ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t, amountCommitment: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.h(9) }, { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t, memoPayload: "changed" }, { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t, assetEntry: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.authority.toBase58() },
            { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t, fundingRootAccount: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.authority.toBase58() }, { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t, proof: { ...proof, publicInputs: proof.publicInputs.slice(0, 12) } },
            { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t, proof: { ...proof, publicInputs: [...proof.publicInputs.slice(0, 12), verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.h(77)] } }]) {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.changed2 = changed;
            assert.throws(throwsCase19.bind(null, {
                verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
            }));
        }
        assert.throws(throwsCase20.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        }), /SIGNATURE_MISMATCH/);
        assert.throws(throwsCase21.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        }));
        assert.throws(throwsCase22.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        }));
        // Dedicated coordination receipts bind every public ledger checkpoint.
        for (const kind of ["TCAP_EPOCH_ACCOUNTING"]) {
            const scalar = scalarComponent;
            const value = { assetEntry: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.assetEntry, reserveState: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.reserveState, tcapConfig: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.tcapConfig };
            let state;
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.accounts = undefined;
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payload = undefined;
            Object.assign(value, { accountingEpoch: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.accountingEpoch, total: "500", proof: { publicInputs: [scalar(19), scalar(20), scalar(500), scalar(2), scalar(1)], proofA: "00".repeat(64), proofB: "00".repeat(128), proofC: "00".repeat(64) } });
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.accounts = [verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.authority, pda("tsn_mother_escrow", verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TSNP), new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.tcapConfig), new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.assetEntry), new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.reserveState), new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.accountingEpoch), pda("gpru:tcap-epoch-verifier:v1", GPRU), GPRU];
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payload = Buffer.concat([hash("global:account_credit_epoch_v1").subarray(0, 8), uint(500, 8), ...value.proof.publicInputs.map(mapCase24), Buffer.alloc(256)]);
            state = Buffer.alloc(136);
            hash("account:TcapCreditEpochV1").copy(state, 0, 0, 8);
            state.writeUInt16LE(1, 8);
            state[10] = PublicKey.findProgramAddressSync([Buffer.from("tcap:credit-epoch:v1"), new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.assetEntry).toBuffer(), uint(0, 8)], verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TCAP)[1];
            new PublicKey(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.assetEntry).toBuffer().copy(state, 11);
            uint(1, 4).copy(state, 51);
            Buffer.from(scalar(19), "hex").copy(state, 55);
            Buffer.from(scalar(20), "hex").copy(state, 87);
            uint(2, 8).copy(state, 119);
            state[135] = 1;
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.writable = [verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.accounts[4], verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.accounts[5]];
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.keys2 = [verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payer, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.authority, ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.writable, ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.accounts, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TCAP].filter(filterCase25);
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.index = indexComponent.bind(null, {
                verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
            });
            const makeReceipt = makeReceiptComponent.bind(null, {
                verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
            });
            const { signature, receipt } = makeReceipt();
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature2 = signature;
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.receipt2 = receipt;
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.cw = { kind, authorization: { transition: value } };
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.root2 = { owner: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.TCAP.toBase58(), data: [state.toString("base64"), "base64"] };
            assert.equal(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.assertSettlementReceipt(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.cw, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature2, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.receipt2, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.mother, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.root2).slot, 100);
            for (const offset of [8, 10, 11, 43, 51, 55, 87, 119, 135]) {
                verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.changed3 = Buffer.from(state);
                verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.changed3[offset] ^= offset === 79 ? 2 : 1;
                assert.throws(throwsCase31.bind(null, {
                    verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
                }), /RECEIPT_MISMATCH/);
            }
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.wrong = makeReceipt(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.keys2.length - 3 - verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.writable.length);
            assert.throws(throwsCase32.bind(null, {
                verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
            }), /PERMISSIONS/);
        }
        await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(funding.id).create(funding);
        await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id).create(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.work);
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.calls = 0;
        globalThis.fetch = fixtureCallback.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        });
        const request = requestComponent.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        });
        assert.equal((await POST(request("bad"))).status, 401);
        assert.equal(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.calls, 0);
        assert.equal((await POST(request("synthetic-receipt-key", { id: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, expectedVersion: "28", signature: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature, execute: false }))).status, 400);
        assert.equal((await POST(request("synthetic-receipt-key"))).status, 200);
        assert.deepEqual((await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id).get()).data(), verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.work);
        assert.equal(wakes.length, 0);
        await assert.rejects(reconcileSettlementReceipt({ id: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, expectedVersion: 27, signature: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature, execute: true }), /STALE_STATE_VERSION/);
        const response = await POST(request("synthetic-receipt-key", { id: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, expectedVersion: 28, signature: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature, execute: true }));
        assert.equal(response.status, 200);
        assert.equal(response.data.stateVersion, 29);
        assert.deepEqual(wakes, ["PRIVATE_CREDIT_RECEIPT_RECONCILED"]);
        const after = (await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id).get()).data();
        assert.equal(after.status, "CONFIRMED");
        assert.equal(after.authorization, null);
        assert.deepEqual(after.payload, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.work.payload);
        assert.deepEqual(after.retryHistory, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.work.retryHistory);
        assert.deepEqual(after.reconciliationHistory[0].previousResult, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.work.result);
        assert.equal(after.result.signature, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature);
        assert.deepEqual((await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(funding.id).get()).data(), funding);
        assert.equal((await POST(request("synthetic-receipt-key", { id: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, expectedVersion: 28, signature: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature, execute: true }))).status, 409);
        // Durable pre-broadcast identity is lease-guarded and cannot be replaced.
        await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.db.runTransaction(runTransactionCase.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        }));
        const evidence = { signature: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature, blockhash: "11111111111111111111111111111111", lastValidBlockHeight: "1000", wireSha256: "ab".repeat(32), wireBytes: 2909, stage: "TCAP_GPRU_MEMO_CREDIT_V2_SIGNED" };
        await assert.rejects(recordSettlementSubmission({ id: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, owner: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.authority.toBase58(), expectedVersion: 28, evidence }), /LEASE_INVALID/);
        await recordSettlementSubmission({ id: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, owner: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payer.toBase58(), expectedVersion: 28, evidence });
        await recordSettlementSubmission({ id: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, owner: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payer.toBase58(), expectedVersion: 28, evidence });
        await assert.rejects(recordSettlementSubmission({ id: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, owner: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payer.toBase58(), expectedVersion: 28, evidence: { ...evidence, wireSha256: "cd".repeat(32) } }), /ALREADY_RECORDED/);
        Date.now = expiredCrankerReportTime.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        });
        assert.equal(await leaseForCranker(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payer.toBase58(), ["SETTLEMENT"]), null);
        const expired = (await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id).get()).data();
        assert.equal(expired.status, "FAILED");
        assert.equal(expired.crankerLease, null);
        assert.equal(expired.result.signature, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature);
        const leaseExpiry = new Date(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.realNow() + 60000).toISOString();
        const checkpoint = { ...evidence, wireSha256: createHash("sha256").update(Buffer.from(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.receipt.transaction[0], "base64")).digest("hex"), wireBytes: Buffer.from(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.receipt.transaction[0], "base64").length };
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork = { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.work, status: "CRANKER_LEASED", stateVersion: 28, result: checkpoint,
            authorization: { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.work.authorization, workStateVersion: 27, leaseId: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, leaseVersion: 27, leaseExpiresAt: leaseExpiry },
            crankerLease: { owner: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payer.toBase58(), leaseId: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, version: 27, expiresAt: leaseExpiry } };
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reset = resetComponent.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        });
        const reportParams = { id: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, owner: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payer.toBase58(), expectedVersion: 28, signature: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature };
        const reportRequest = reportRequestComponent.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        });
        await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reset(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork);
        assert.equal((await reportConfirmation(reportRequest(null))).status, 401);
        for (const changed of [
            { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork, result: null }, { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork, nodeLease: { owner: "another-node" } },
            { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork, stateVersion: 30 }, { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork, status: "VERIFIED" },
            { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork, authorization: { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork.authorization, leaseVersion: 26 } },
            { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork, authorization: { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork.authorization, leaseExpiresAt: "invalid" } },
        ]) {
            await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reset(changed);
            await assert.rejects(reconcileExpiredCrankerConfirmation(reportParams), /NOT_ELIGIBLE/);
        }
        await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reset(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork);
        Date.now = verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.realNow;
        await assert.rejects(reconcileExpiredCrankerConfirmation(reportParams), /NOT_ELIGIBLE/);
        Date.now = expiredCrankerReportTime.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        });
        await assert.rejects(reconcileExpiredCrankerConfirmation({ ...reportParams, expectedVersion: 27 }), /NOT_ELIGIBLE/);
        await assert.rejects(reconcileExpiredCrankerConfirmation({ ...reportParams, signature: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature.slice(0, -1) + (verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature.endsWith("1") ? "2" : "1") }), /SIGNATURE_MISMATCH/);
        for (const changed of [
            { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork, result: { ...checkpoint, wireSha256: "cd".repeat(32) } },
            { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork, result: { ...checkpoint, wireBytes: checkpoint.wireBytes + 1 } },
            { ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork, result: { ...checkpoint, blockhash: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.authority.toBase58() } },
        ]) {
            await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reset(changed);
            await assert.rejects(reconcileExpiredCrankerConfirmation(reportParams), /SUBMISSION_MISMATCH/);
        }
        await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reset({ ...verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork, status: "FAILED", stateVersion: 29, crankerLease: null });
        await assert.rejects(reconcileExpiredCrankerConfirmation({ ...reportParams, owner: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.authority.toBase58() }), /SUBMISSION_MISMATCH/);
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.failedRpcFetch = globalThis.fetch;
        globalThis.fetch = fixtureCallback43;
        assert.equal((await reportConfirmation(reportRequest())).status, 409);
        assert.equal((await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id).get()).data().status, "FAILED");
        globalThis.fetch = verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.failedRpcFetch;
        await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reset(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork);
        const confirmedLate = await reportConfirmation(reportRequest());
        assert.equal(confirmedLate.status, 200);
        assert.equal(confirmedLate.data.status, "CONFIRMED");
        assert.equal(confirmedLate.data.receipt.confirmationStatus, "finalized");
        assert.equal(confirmedLate.data.stateVersion, 29);
        assert.equal((await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id).get()).data().crankerLease, null);
        assert.equal((await reportConfirmation(reportRequest())).status, 200, "same terminal signature remains idempotent");
        await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reset(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork);
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reclaimed = false;
        globalThis.fetch = fixtureCallback44.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        });
        const reclaimedResponse = await reportConfirmation(reportRequest());
        assert.equal(reclaimedResponse.status, 200);
        assert.equal(reclaimedResponse.data.stateVersion, 30);
        const reconciled = (await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id).get()).data();
        assert.equal(reconciled.reconciliationHistory.at(-1).previousStatus, "FAILED");
        assert.equal(reconciled.reconciliationHistory.at(-1).reportedBy, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payer.toBase58());
        assert.deepEqual(reconciled.payload, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.work.payload);
        assert.deepEqual(reconciled.retryHistory, verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.work.retryHistory);
        assert.deepEqual((await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(funding.id).get()).data(), funding);
        // A changed authorization during receipt reads cannot be accepted.
        await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reset(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork);
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reclaimed = false;
        globalThis.fetch = fixtureCallback45.bind(null, {
            verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext
        });
        assert.equal((await reportConfirmation(reportRequest())).status, 409);
        assert.equal((await verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id).get()).data().status, "CRANKER_LEASED");
    }
    finally {
        globalThis.fetch = realFetch;
        Date.now = verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.realNow;
        for (const n of names)
            if (previous[n] === undefined)
                delete process.env[n];
            else
                process.env[n] = previous[n];
        await rm(verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.directory, { recursive: true, force: true });
    }
}
