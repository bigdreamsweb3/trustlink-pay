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

export async function caseCheckpointAuthorizationPayloadAndFundingMustRetainExactCorrespon(work, transition, reset, rpcFixture, resolveFailedSettlement, params, calls, wakes, funding) {
    for (const changed of [
        { ...work, result: { ...work.result, wireSha256: "invalid" } },
        { ...work, result: { ...work.result, wireBytes: 0 } },
        { ...work, result: { ...work.result, blockhash: PublicKey.default.toBase58() } },
        { ...work, result: { ...work.result, stage: "different" } },
        { ...work, result: { ...work.result, signature: "different" } },
        { ...work, authorization: { ...work.authorization, kind: "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V2" } },
        { ...work, authorization: { ...work.authorization, transition: { ...transition, previousTcapRoot: "dd".repeat(32) } } },
        { ...work, payload: { ...work.payload, intentId: "changed-funding" } },
        { ...work, crankerLease: { owner: "still-leased", expiresAt: new Date(0).toISOString() } },
    ]) {
        await reset(changed);
        rpcFixture();
        await assert.rejects(resolveFailedSettlement({ ...params, execute: true }));
        assert.equal(calls.value.length, 0);
        assert.equal(wakes.length, 0);
    }
    await reset(work, { ...funding, status: "FAILED" });
    rpcFixture();
    await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), /FUNDING_NOT_CONFIRMED/);
}
