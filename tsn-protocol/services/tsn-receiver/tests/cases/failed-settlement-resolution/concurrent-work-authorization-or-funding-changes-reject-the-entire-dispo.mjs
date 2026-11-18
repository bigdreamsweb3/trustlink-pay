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
import { mutateWorkVersion } from "./mutate-work-version.mjs";
import { mutateAuthorizationContext } from "./mutate-authorization-context.mjs";
import { mutateFundingVersion } from "./mutate-funding-version.mjs";
import { mutateCheckpointContext } from "./mutate-checkpoint-context.mjs";
import { mutateDuringReceiptRead } from "./mutate-during-receipt-read.mjs";
export async function caseConcurrentWorkAuthorizationOrFundingChangesRejectTheEntireDispo(reset, rpcFixture, resolveFailedSettlement, params, workCollection, id, wakes, db, work, funding) {
    for (const mutate of [
        mutateWorkVersion.bind(null, db, workCollection, id),
        mutateAuthorizationContext.bind(null, db, workCollection, id, work),
        mutateFundingVersion.bind(null, db, workCollection, funding),
        mutateCheckpointContext.bind(null, db, workCollection, id, work),
    ]) {
        await reset();
        let mutated = { value: false };
        rpcFixture(mutateDuringReceiptRead.bind(null, mutated, mutate));
        await assert.rejects(resolveFailedSettlement({ ...params, execute: true }), /STALE_STATE_VERSION/);
        assert.equal((await workCollection.doc(id).get()).data().nonExecutionResolution, undefined);
        assert.equal(wakes.length, 0);
    }
}
