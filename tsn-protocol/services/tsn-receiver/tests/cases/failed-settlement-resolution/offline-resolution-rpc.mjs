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

export async function offlineResolutionRpc(calls, roots, rootReply, rootAddress, signature, change, url, init) {
    assert.equal(String(url), "https://offline.invalid");
    const body = JSON.parse(init.body);
    calls.value.push(body);
    assert.ok(["getAccountInfo", "getTransaction", "getSignatureStatuses", "isBlockhashValid", "getBlockHeight"].includes(body.method), "no mutating RPC method is permitted");
    let result;
    if (body.method === "getAccountInfo") {
        roots.value++;
        result = rootReply(roots.value === 1 ? 1000 : 1003);
        assert.equal(body.params[0], rootAddress.toBase58());
        assert.equal(body.params[1].commitment, "finalized");
        if (roots.value > 1)
            assert.equal(body.params[1].minContextSlot, 1002);
    }
    if (body.method === "getTransaction") {
        result = null;
        assert.equal(body.params[0], signature);
        assert.equal(body.params[1].commitment, "finalized");
    }
    if (body.method === "getSignatureStatuses") {
        result = { context: { slot: 1001 }, value: [null] };
        assert.equal(body.params[1].searchTransactionHistory, true);
    }
    if (body.method === "isBlockhashValid") {
        result = { context: { slot: 1002 }, value: false };
        assert.equal(body.params[1].minContextSlot, 1000);
        assert.equal(body.params[1].commitment, "finalized");
    }
    if (body.method === "getBlockHeight") {
        result = 501;
        assert.equal(body.params[0].minContextSlot, 1002);
        assert.equal(body.params[0].commitment, "finalized");
    }
    const changed = await change(body.method, structuredClone(result), roots.value);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: changed }));
}
