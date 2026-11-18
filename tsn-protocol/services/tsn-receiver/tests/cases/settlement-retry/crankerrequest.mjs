/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { serializeRequestBody } from "./serialize-request-body.mjs";
export function caseCrankerrequest(id, FUNDED_ROOT_STALE, owner, body = { id, expectedVersion: 9, reason: FUNDED_ROOT_STALE }) {
    return ({ headers: new Headers(owner ? { "x-test-cranker": owner } : {}), text: serializeRequestBody.bind(null, body) });
}
