/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

export async function reassignNodeLeaseTransaction(workCollection, expired, work, clock, transaction) {
    await transaction.get(workCollection.doc(expired.id));
    transaction.update(workCollection.doc(expired.id), { stateVersion: work.stateVersion + 2,
        nodeLease: { owner: "other-node", leaseId: expired.id, version: work.stateVersion + 2, expiresAt: new Date(clock.value + 60000).toISOString() } });
}
