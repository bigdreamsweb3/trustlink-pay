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
import { failResolutionFetch } from "./fail-resolution-fetch.mjs";
import { failedRpcHttpResponse } from "./failed-rpc-http-response.mjs";
import { rpcErrorResponse } from "./rpc-error-response.mjs";
import { missingRpcResultResponse } from "./missing-rpc-result-response.mjs";
import { nullRpcResultResponse } from "./null-rpc-result-response.mjs";
export async function caseRpcTransportJsonRpcErrorsAndMissingDataAreFailures(reset, resolveFailedSettlement, params, workCollection, id, work, wakes) {
    for (const fetcher of [failResolutionFetch, failedRpcHttpResponse, rpcErrorResponse, missingRpcResultResponse, nullRpcResultResponse]) {
        await reset();
        globalThis.fetch = fetcher;
        await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), /RPC_UNAVAILABLE|STALE_RPC_CONTEXT/);
        assert.deepEqual((await workCollection.doc(id).get()).data(), work);
        assert.equal(wakes.length, 0);
    }
}
