/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { caseRejectExtraFundingFields } from "./reject-extra-funding-fields.mjs";
import { caseRejectExtraSettlementFields } from "./reject-extra-settlement-fields.mjs";
export function caseDurablePayloadAllowlists(createReceivedWork) {
    assert.throws(caseRejectExtraFundingFields.bind(null, createReceivedWork), /UNSUPPORTED_PAYLOAD_FIELD/);
    assert.throws(caseRejectExtraSettlementFields.bind(null, createReceivedWork), /UNSUPPORTED_PAYLOAD_FIELD/);
}
