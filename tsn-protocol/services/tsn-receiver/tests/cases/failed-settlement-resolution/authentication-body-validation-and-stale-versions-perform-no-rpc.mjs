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

export async function caseAuthenticationBodyValidationAndStaleVersionsPerformNoRpc(POST, request, params, resolveFailedSettlement, calls, wakes) {
    assert.equal((await POST(request(params, "wrong"))).status, 401);
    assert.equal((await POST(request({ ...params, execute: "false" }))).status, 400);
    assert.equal((await POST(request({ ...params, expectedVersion: 0 }))).status, 400);
    await assert.rejects(resolveFailedSettlement({ ...params, expectedVersion: 302 }), /STALE_STATE_VERSION/);
    assert.equal(calls.value.length, 0);
    assert.equal(wakes.length, 0);
}
