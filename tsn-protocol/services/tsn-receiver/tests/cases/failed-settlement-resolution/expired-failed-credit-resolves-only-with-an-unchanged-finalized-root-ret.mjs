/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import { captureEnvironmentEntry } from "../shared/capture-environment-entry.mjs";
import { loadReceiverFixtureModule } from "../shared/load-receiver-fixture-module.mjs";
import { caseRootreply } from "./rootreply.mjs";
import { caseRequest } from "./request.mjs";
import { caseReset } from "./reset.mjs";
import { caseRpcfixture } from "./rpcfixture.mjs";
import { assertDurableResolutionBeforeWake } from "./assert-durable-resolution-before-wake.mjs";
import { caseAuthenticationBodyValidationAndStaleVersionsPerformNoRpc } from "./authentication-body-validation-and-stale-versions-perform-no-rpc.mjs";
import { casePreviewPreservesEveryOriginalRecordAndLeavesTheGlobalLockBlock } from "./preview-preserves-every-original-record-and-leaves-the-global-lock-block.mjs";
import { caseProcessedSignatureStatusContextNeverBecomesAFinalizedBankMinimu } from "./processed-signature-status-context-never-becomes-a-finalized-bank-minimu.mjs";
import { caseObservedTransactionsAdvancedRootsAndInsufficientFinalityAlwaysRe } from "./observed-transactions-advanced-roots-and-insufficient-finality-always-re.mjs";
import { caseRpcTransportJsonRpcErrorsAndMissingDataAreFailures } from "./rpc-transport-json-rpc-errors-and-missing-data-are-failures.mjs";
import { caseCheckpointAuthorizationPayloadAndFundingMustRetainExactCorrespon } from "./checkpoint-authorization-payload-and-funding-must-retain-exact-correspon.mjs";
import { caseConcurrentWorkAuthorizationOrFundingChangesRejectTheEntireDispo } from "./concurrent-work-authorization-or-funding-changes-reject-the-entire-dispo.mjs";
import { caseExecutionRecordsNonexecutionPreservesOriginalsAndPermitsTheNextundefined } from "./execution-records-nonexecution-preserves-originals-and-permits-the-next-.mjs";
import { debitWithoutFunding } from "./debit-without-funding.mjs";
export async function caseExpiredFailedCreditResolvesOnlyWithAnUnchangedFinalizedRootRet(t) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-nonexecution-"));
    const names = ["TSN_RECEIVER_LOCAL_FILE", "TSN_RECEIVER_NODE_API_KEY", "TSN_RPC_URL"];
    const previous = Object.fromEntries(names.map(captureEnvironmentEntry));
    const realFetch = globalThis.fetch;
    process.env.TSN_RECEIVER_LOCAL_FILE = path.join(directory, "store.json");
    process.env.TSN_RECEIVER_NODE_API_KEY = "synthetic-recovery-key";
    process.env.TSN_RPC_URL = "https://offline.invalid";
    try {
        await compileReceiverFixture(directory, ["work-contract.ts", "failed-settlement-resolution.ts", "local-firestore.ts", "store.ts", "settlement-retry.ts", "native-work-retry.ts", "node-authorizations.ts", "auth.ts", "http/api/work-status/by-id/GET.ts"], { routes: [{ path: "app/api/internal/node/work/resolve-failed/route.ts", output: "route" }] });
        for (const [name, source] of Object.entries({
            firebase: 'import {localDb} from "./local-firestore.mjs";export const db=localDb;export const workCollection=db.collection("tsn_receiver_work");',
            "firestore-stub": "export const FieldPath={};export const Timestamp={};",
            "node-envelope": "export const decryptPayloadForNode=x=>x;export const encryptPayloadForNode=x=>x;",
            "node-verification": "export const assertNodeVerificationAttestation=()=>{};",
            "node-wake": "export const wakes=[];let check=async()=>{};export const setWakeCheck=fn=>{check=fn};export const wakeTsnNode=async reason=>{await check();wakes.push(reason)};",
            "cranker-wake": "export const publishCrankerWake=async()=>{};",
            "next-stub": "export class NextResponse {static json(data,options={}){return {status:options.status??200,data};}}",
        }))
            await writeFile(path.join(directory, `${name}.mjs`), source);
        const load = loadReceiverFixtureModule.bind(null, directory);
        const { db, workCollection } = await load("firebase");
        const { payloadCommitment, createReceivedWork, hasResolvedNonExecution } = await load("work-contract");
        const { resolveFailedSettlement } = await load("failed-settlement-resolution");
        const { leaseForNode } = await load("store");
        const { POST } = await load("route");
        const { GET: getPublicStatus } = await load("http/api/work-status/by-id/GET");
        const { wakes, setWakeCheck } = await load("node-wake");
        const TCAP = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
        const [rootAddress, bump] = PublicKey.findProgramAddressSync([Buffer.from("tcap:commitment-root:v1")], TCAP);
        const funding = { ...createReceivedWork({ id: "funded-old", kind: "AUTHORIZED_FUNDING", payload: { paymentId: "old-payment" } }), status: "CONFIRMED", stateVersion: 5, result: { signature: "confirmed-funding" } };
        const id = `settlement-${createHash("sha256").update(`${funding.id}:${funding.payloadCommitment}`).digest("hex").slice(0, 32)}`;
        const signature = "4je4ACJRGaRfWzrHSRVw7k99KWp4pSGrdaPMcwcj7mhBDAsdLAkyF2RwJ8Tm5YChU6CyaadsLGd6YYyaCqKWrbqn";
        const transition = { commitmentRoot: rootAddress.toBase58(), previousTcapRoot: "aa".repeat(32), tcapRootSequence: "6", validAfterSlot: "850", expiresAtSlot: "900",
            proof: { publicInputs: ["aa".repeat(32), ...Array(12).fill("bb".repeat(32))] }, memoPayload: "synthetic encrypted Memo" };
        const work = { ...createReceivedWork({ id, kind: "SETTLEMENT", payload: { intentId: funding.id, paymentId: funding.payload.paymentId } }), status: "FAILED", stateVersion: 303,
            verification: { verificationType: "TSN_TCAP_GPRU_HIDDEN_HEAD_V1", payloadDelta: { addedFields: { tcapCreditTransition: transition }, changedFields: {}, removedFields: [] } },
            authorization: { kind: "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3", transition, workStateVersion: 301, leaseId: id, leaseVersion: 301, leaseExpiresAt: new Date(0).toISOString() },
            result: { signature, blockhash: "AtsZHJL9F6j7kpmW3DQ4Sy25WZXTdbRYUiXFCBRgXtCd", lastValidBlockHeight: "500", wireSha256: "cc".repeat(32), wireBytes: 2909, stage: "TCAP_GPRU_MEMO_CREDIT_V2_SIGNED", reason: "historical preflight rejection" },
            retryHistory: [{ reason: "retained original history" }], nodeLease: null, crankerLease: null };
        const nextFunding = { ...funding, id: "funded-next" };
        const next = createReceivedWork({ id: "new-settlement", kind: "SETTLEMENT", payload: { intentId: nextFunding.id } });
        const rootData = Buffer.alloc(124);
        createHash("sha256").update("account:TcapCommitmentRootStateV1").digest().copy(rootData, 0, 0, 8);
        rootData.writeUInt16LE(1, 8);
        rootData.writeUInt16LE(1, 10);
        rootData.fill(0xaa, 12, 44);
        rootData.writeUInt32LE(6, 76);
        rootData.writeBigUInt64LE(5n, 80);
        rootData[123] = bump;
        const rootReply = caseRootreply.bind(null, TCAP, rootData);
        const params = { id, expectedVersion: 303, signature, execute: false };
        const request = caseRequest.bind(null, params);
        const reset = caseReset.bind(null, wakes, db, work, funding, workCollection, id, nextFunding, next);
        let calls = { value: [] };
        const rpcFixture = caseRpcfixture.bind(null, calls, rootReply, rootAddress, signature);
        await reset();
        rpcFixture();
        setWakeCheck(assertDurableResolutionBeforeWake.bind(null, hasResolvedNonExecution, workCollection, id));
        await t.test("authentication, body validation and stale versions perform no RPC", caseAuthenticationBodyValidationAndStaleVersionsPerformNoRpc.bind(null, POST, request, params, resolveFailedSettlement, calls, wakes));
        await t.test("preview preserves every original record and leaves the global lock blocking", casePreviewPreservesEveryOriginalRecordAndLeavesTheGlobalLockBlock.bind(null, leaseForNode, POST, request, wakes));
        await t.test("processed signature-status context never becomes a finalized bank minimum", caseProcessedSignatureStatusContextNeverBecomesAFinalizedBankMinimu.bind(null, reset, rpcFixture, resolveFailedSettlement, params, calls));
        await t.test("observed transactions, advanced roots and insufficient finality always retain the lock", caseObservedTransactionsAdvancedRootsAndInsufficientFinalityAlwaysRe.bind(null, reset, rpcFixture, resolveFailedSettlement, params, workCollection, id, work, wakes, leaseForNode));
        await t.test("RPC transport, JSON-RPC errors and missing data are failures", caseRpcTransportJsonRpcErrorsAndMissingDataAreFailures.bind(null, reset, resolveFailedSettlement, params, workCollection, id, work, wakes));
        await t.test("checkpoint, authorization, payload and funding must retain exact correspondence", caseCheckpointAuthorizationPayloadAndFundingMustRetainExactCorrespon.bind(null, work, transition, reset, rpcFixture, resolveFailedSettlement, params, calls, wakes, funding));
        await t.test("concurrent work, authorization or funding changes reject the entire disposition", caseConcurrentWorkAuthorizationOrFundingChangesRejectTheEntireDispo.bind(null, reset, rpcFixture, resolveFailedSettlement, params, workCollection, id, wakes, db, work, funding));
        await t.test("execution records nonexecution, preserves originals and permits the next normal lease", caseExecutionRecordsNonexecutionPreservesOriginalsAndPermitsTheNextundefined.bind(null, reset, rpcFixture, POST, request, params, workCollection, id, hasResolvedNonExecution, work, funding, wakes, db, leaseForNode, next, resolveFailedSettlement, payloadCommitment));
        await t.test("failed TIN-Debit resolves without inventing a funding record", debitWithoutFunding.bind(null, {
          work, transition, createReceivedWork, workCollection, db, resolveFailedSettlement, hasResolvedNonExecution,
          rpcFixture, setWakeCheck, assertDurableResolutionBeforeWake, payloadCommitment,
          getPublicStatus,
        }));
    }
    finally {
        globalThis.fetch = realFetch;
        for (const name of names)
            if (previous[name] === undefined)
                delete process.env[name];
            else
                process.env[name] = previous[name];
        await rm(directory, { recursive: true, force: true });
    }
}
