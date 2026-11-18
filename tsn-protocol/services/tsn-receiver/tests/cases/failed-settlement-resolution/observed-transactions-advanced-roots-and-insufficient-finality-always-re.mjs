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
import { successfulTransactionMeta } from "./successful-transaction-meta.mjs";
import { failedTransactionMeta } from "./failed-transaction-meta.mjs";
import { processedSignatureStatus } from "./processed-signature-status.mjs";
import { contextBeforeBaseline } from "./context-before-baseline.mjs";
import { olderRootContext } from "./older-root-context.mjs";
import { changeRootSequence } from "./change-root-sequence.mjs";
import { changeRootHash } from "./change-root-hash.mjs";
import { changeRootOwner } from "./change-root-owner.mjs";
import { changeRootSuffix } from "./change-root-suffix.mjs";
import { validBlockhashReply } from "./valid-blockhash-reply.mjs";
import { unexpiredBlockHeight } from "./unexpired-block-height.mjs";
import { missingRootReply } from "./missing-root-reply.mjs";
import { alterSelectedRpcResult } from "./alter-selected-rpc-result.mjs";
import { flipRootAccountByte } from "./flip-root-account-byte.mjs";
import { truncateRootAccountData } from "./truncate-root-account-data.mjs";
import { staleSecondRootContext } from "./stale-second-root-context.mjs";
export async function caseObservedTransactionsAdvancedRootsAndInsufficientFinalityAlwaysRe(reset, rpcFixture, resolveFailedSettlement, params, workCollection, id, work, wakes, leaseForNode) {
    const cases = [
        ["getTransaction", successfulTransactionMeta, /RECEIPT_OBSERVED/],
        ["getTransaction", failedTransactionMeta, /RECEIPT_OBSERVED/],
        ["getSignatureStatuses", processedSignatureStatus, /SIGNATURE_OBSERVED/],
        ["getSignatureStatuses", contextBeforeBaseline, /STALE_RPC_CONTEXT/],
        ["getAccountInfo", olderRootContext, /AUTHORIZATION_NOT_EXPIRED/],
        ["getAccountInfo", changeRootSequence, /ROOT_CHANGED/],
        ["getAccountInfo", changeRootHash, /ROOT_CHANGED/],
        ["getAccountInfo", changeRootOwner, /INVALID_ROOT_ACCOUNT/],
        ["getAccountInfo", changeRootSuffix, /INVALID_ROOT_ACCOUNT/],
        ["isBlockhashValid", validBlockhashReply, /BLOCKHASH_NOT_EXPIRED/],
        ["isBlockhashValid", contextBeforeBaseline, /STALE_RPC_CONTEXT/],
        ["getBlockHeight", unexpiredBlockHeight, /BLOCKHASH_NOT_EXPIRED/],
        ["getBlockHeight", missingRootReply, /BLOCKHASH_NOT_EXPIRED/],
    ];
    for (const [method, alter, reason] of cases) {
        await reset();
        rpcFixture(alterSelectedRpcResult.bind(null, method, alter));
        await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), reason);
        assert.deepEqual((await workCollection.doc(id).get()).data(), work);
        assert.equal(wakes.length, 0);
        assert.equal(await leaseForNode("waiting-node", ["SETTLEMENT"]), null);
    }
    for (const offset of [0, 8, 10]) {
        await reset();
        rpcFixture(flipRootAccountByte.bind(null, offset));
        await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), /INVALID_ROOT_ACCOUNT/);
    }
    await reset();
    rpcFixture(truncateRootAccountData);
    await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), /INVALID_ROOT_ACCOUNT/);
    await reset();
    rpcFixture(staleSecondRootContext);
    await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), /STALE_RPC_CONTEXT/);
}
