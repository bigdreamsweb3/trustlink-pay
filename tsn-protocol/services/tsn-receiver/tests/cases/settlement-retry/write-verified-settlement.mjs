/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

export async function writeVerifiedSettlement(workCollection, id, leased, transaction) { await transaction.get(workCollection.doc(id)); transaction.update(workCollection.doc(id), { ...leased, status: "VERIFIED", stateVersion: 20, crankerLease: null, authorization: null }); }
