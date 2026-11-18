/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { authenticatedRequestFixture } from "../shared/authenticated-request-fixture.mjs";
export function caseRequest(params, key = "synthetic-node-credential", body = params) {
    return authenticatedRequestFixture(key, body);
}
