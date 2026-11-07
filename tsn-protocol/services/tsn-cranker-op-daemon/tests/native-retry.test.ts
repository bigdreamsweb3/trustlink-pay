import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nativeConflictReason, nativeWorkRetryReason } from "../src/receiver/native-retry.js";

const reasons = ["TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT", "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT",
  "TCAP_POOL_CAPTURE_STALE", "TCAP_CREDIT_EPOCH_CHANGED_BEFORE_SETTLEMENT", "TCAP_EPOCH_ALREADY_ACCOUNTED",
  "TCAP_TRANSACTION_BLOCKHASH_TOO_OLD_FOR_SUBMISSION",
  "TIP route root changed since settlement verification", "TCAP credit authorization expired",
  "Cranker transaction blockhash is no longer valid; rebuild and request a fresh Mother signature"];

test("exact FastAPI and Receiver conflict envelopes become guarded native reasons", () => {
  for (const reason of reasons) for (const field of ["detail", "error"]) {
    const rejection = JSON.parse(JSON.stringify({ [field]: reason }));
    assert.equal(nativeConflictReason(409, rejection), reason);
  }
  assert.equal(nativeConflictReason(409, JSON.parse('{"detail":"TCAP_POOL_CAPTURE_STALE"}')), "TCAP_POOL_CAPTURE_STALE");
});

test("unrecognized, malformed, mixed and non-conflict failures never authorize re-verification", () => {
  for (const rejection of [null, [], "TCAP_POOL_CAPTURE_STALE", {}, { detail: ["TCAP_POOL_CAPTURE_STALE"] },
    { detail: "prefix TCAP_POOL_CAPTURE_STALE" }, { error: "LEASE_INVALID" },
    { detail: "denied", error: "TCAP_POOL_CAPTURE_STALE" }]) assert.equal(nativeConflictReason(409, rejection), null);
  for (const status of [400, 401, 403, 404, 429, 500, 503]) assert.equal(nativeConflictReason(status, { detail: reasons[2] }), null);
});

test("only unsigned native work is eligible for a fresh Node decision", () => {
  for (const kind of ["TCAP_FUNDING_POOL", "TCAP_EPOCH_ACCOUNTING", "SETTLEMENT"]) {
    const work = { kind, verification: { verificationType: "TSN_TCAP_GPRU_HIDDEN_HEAD_V1" } };
    for (const reason of reasons) {
      assert.equal(nativeWorkRetryReason(work, new Error(reason)), reason);
      assert.equal(nativeWorkRetryReason({ ...work, result: { signature: "signed-or-uncertain" } }, new Error(reason)), null);
    }
    assert.equal(nativeWorkRetryReason(work, new Error("LEASE_INVALID")), null);
    assert.equal(nativeWorkRetryReason(work, reasons[2]), null);
  }
  for (const kind of ["AUTHORIZED_FUNDING", "TIN_OPERATION", "other"]) assert.equal(nativeWorkRetryReason({ kind }, new Error(reasons[2])), null);
  assert.equal(nativeWorkRetryReason({ kind: "SETTLEMENT", verification: { verificationType: "TSN_CREDITCOIN" } }, new Error(reasons[2])), null);
  assert.equal(nativeWorkRetryReason({ kind: "SETTLEMENT" }, new Error(reasons[2])), null);
});

test("daemon normalizes conflicts and handles guarded retries before FAILED, even if retry is refused", async () => {
  const source = await readFile(new URL("../scripts/cranker.ts", import.meta.url), "utf8");
  assert.ok(source.includes("nativeConflictReason(response.status, rejection)"));
  assert.ok(source.includes("if (nativeReason) throw new Error(nativeReason)"));
  const branch = source.slice(source.indexOf("const retryReason = nativeWorkRetryReason(work, error)"));
  assert.match(branch, /reason: retryReason,[\s\S]*?"\/api\/cranker\/work\/retry"/);
  assert.match(branch, /catch \(retryError\) {[\s\S]*?continue;[\s\S]*?await report\(signer, work, "FAILED"/);
});
