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

export async function seedResolutionLineage(workCollection, id, changedWork, funding, changedFunding, nextFunding, next, db, tx) {
    tx.set(workCollection.doc(id), changedWork);
    tx.set(workCollection.doc(funding.id), changedFunding);
    tx.set(workCollection.doc(nextFunding.id), nextFunding);
    tx.set(workCollection.doc(next.id), next);
    tx.set(db.collection("tsn_private_credit_locks").doc("global-root"), { workId: id });
}
