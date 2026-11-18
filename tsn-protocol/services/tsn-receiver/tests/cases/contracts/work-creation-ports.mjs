/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";

export function caseWorkCreationPorts(createReceivedWork) {
    const work = createReceivedWork({ kind: "SETTLEMENT", payload: { intentId: "funding" } }, {
        clock: Date.bind(null, "2026-11-17T10:00:00.000Z"),
        randomUUID: String.bind(null, "isolated-work-id"),
    });
    assert.equal(work.id, "isolated-work-id");
    assert.equal(work.receivedAt, "2026-11-17T10:00:00.000Z");
    assert.equal(work.updatedAt, work.receivedAt);
    assert.equal(work.stateVersion, 1);
    assert.equal(work.nodeLease, null);
    assert.equal(work.crankerLease, null);
}
