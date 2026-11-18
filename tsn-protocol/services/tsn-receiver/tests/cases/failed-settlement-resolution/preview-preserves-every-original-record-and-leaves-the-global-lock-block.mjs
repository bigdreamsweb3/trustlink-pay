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

export async function casePreviewPreservesEveryOriginalRecordAndLeavesTheGlobalLockBlock(leaseForNode, POST, request, wakes) {
    assert.equal(await leaseForNode("waiting-node", ["SETTLEMENT"]), null);
    const before = await readFile(process.env.TSN_RECEIVER_LOCAL_FILE, "utf8");
    const preview = await POST(request());
    assert.equal(preview.status, 200);
    assert.equal(preview.data.executed, false);
    assert.equal(preview.data.resolution.finalizedSlot, 1003);
    assert.equal(preview.data.resolution.rootSequence, "5");
    assert.equal(await readFile(process.env.TSN_RECEIVER_LOCAL_FILE, "utf8"), before);
    assert.equal(wakes.length, 0);
    assert.equal(await leaseForNode("waiting-node", ["SETTLEMENT"]), null);
}
