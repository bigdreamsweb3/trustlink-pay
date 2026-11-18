/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

export function retryUnrecognizedFundingReason(snapshotRetryPatch, staleRejection, FUNDED_ROOT_STALE, funding) {
    return snapshotRetryPatch({ ...staleRejection, verification: { reason: `${FUNDED_ROOT_STALE}: unrelated` } }, funding, 3, "test");
}
