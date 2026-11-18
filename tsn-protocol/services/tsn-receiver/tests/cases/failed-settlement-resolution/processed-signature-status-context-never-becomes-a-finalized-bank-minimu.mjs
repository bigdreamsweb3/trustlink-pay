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
import { newerSignatureStatusContext } from "./newer-signature-status-context.mjs";
import { isBlockhashValidRequest } from "./is-blockhash-valid-request.mjs";
export async function caseProcessedSignatureStatusContextNeverBecomesAFinalizedBankMinimu(reset, rpcFixture, resolveFailedSettlement, params, calls) {
    await reset();
    rpcFixture(newerSignatureStatusContext);
    const preview = await resolveFailedSettlement(params);
    assert.equal(preview.executed, false);
    assert.equal(preview.resolution.signatureStatusContextSlot, 2000);
    assert.equal(preview.resolution.finalizedSlot, 1003);
    assert.equal(calls.value.find(isBlockhashValidRequest).params[1].minContextSlot, 1000);
}
