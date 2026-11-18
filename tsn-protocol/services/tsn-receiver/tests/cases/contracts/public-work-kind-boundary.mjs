/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { caseRejectPublicSettlementKind } from "./reject-public-settlement-kind.mjs";
import { caseAcceptPublicFundingKind } from "./accept-public-funding-kind.mjs";
export function casePublicWorkKindBoundary(assertExternalWorkKind) {
    assert.throws(caseRejectPublicSettlementKind.bind(null, assertExternalWorkKind), /SETTLEMENT_WORK_INTERNAL_ONLY/);
    assert.doesNotThrow(caseAcceptPublicFundingKind.bind(null, assertExternalWorkKind));
}
