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

export async function caseExecutionRecordsNonexecutionPreservesOriginalsAndPermitsTheNextundefined(reset, rpcFixture, POST, request, params, workCollection, id, hasResolvedNonExecution, work, funding, wakes, db, leaseForNode, next, resolveFailedSettlement, payloadCommitment) {
    await reset();
    rpcFixture();
    const response = await POST(request({ ...params, execute: true }));
    assert.equal(response.status, 200);
    assert.equal(response.data.executed, true);
    assert.equal(response.data.stateVersion, 304);
    const after = (await workCollection.doc(id).get()).data();
    assert.equal(after.status, "FAILED");
    assert.equal(hasResolvedNonExecution(after), true);
    for (const field of ["authorization", "verification", "result", "payload", "payloadCommitment", "retryHistory", "nodeLease", "crankerLease"])
        assert.deepEqual(after[field], work[field]);
    assert.deepEqual((await workCollection.doc(funding.id).get()).data(), funding);
    assert.deepEqual(after.nonExecutionHistory, [after.nonExecutionResolution]);
    assert.deepEqual(wakes, ["PRIVATE_CREDIT_NONEXECUTION_RESOLVED"]);
    assert.equal((await db.collection("tsn_private_credit_locks").doc("global-root").get()).data().workId, id, "recovery does not delete or redirect the lock");
    for (const field of ["result", "authorization", "verification", "payload"])
        assert.equal(hasResolvedNonExecution({ ...after, [field]: { ...after[field], changed: true } }), false);
    assert.equal(hasResolvedNonExecution({ ...after, stateVersion: 305 }), false);
    assert.equal(hasResolvedNonExecution({ ...work, nonExecutionResolution: { kind: "EXPIRED_UNCHANGED_ROOT" } }), false);
    assert.equal((await leaseForNode("waiting-node", ["SETTLEMENT"])).id, next.id);
    await assert.rejects(resolveFailedSettlement({ ...params, expectedVersion: 304, execute: true }), /NOT_FAILED_NATIVE_CREDIT/);
    assert.equal(payloadCommitment(after.result), after.nonExecutionResolution.checkpointCommitment);
}
