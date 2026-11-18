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
import { seedResolutionLineage } from "./seed-resolution-lineage.mjs";
export async function caseReset(wakes, db, work, funding, workCollection, id, nextFunding, next, changedWork = work, changedFunding = funding) {
    wakes.length = 0;
    await db.runTransaction(seedResolutionLineage.bind(null, workCollection, id, changedWork, funding, changedFunding, nextFunding, next, db));
}
