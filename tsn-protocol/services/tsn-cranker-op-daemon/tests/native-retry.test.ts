import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nativeConflictReason, nativeSigningAvailabilityReason, nativeWorkRetryReason } from "../src/receiver/native-retry.js";

const reasons = ["TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT", "TCAP_SHARED_REPLAY_ROOT_CHANGED_BEFORE_SETTLEMENT",
  "TCAP_CREDIT_EPOCH_CHANGED_BEFORE_SETTLEMENT", "TCAP_EPOCH_ALREADY_ACCOUNTED",
  "TCAP_TRANSACTION_BLOCKHASH_TOO_OLD_FOR_SUBMISSION",
  "TCAP_TRANSACTION_BLOCKHASH_HEIGHT_UNAVAILABLE",
  "TCAP_TRANSACTION_BLOCKHASH_LIFETIME_UNAVAILABLE",
  "TSN_NODE_SIGNING_SERVICE_UNAVAILABLE",
  "TIP route root changed since settlement verification", "TCAP credit authorization expired",
  "Cranker transaction blockhash is no longer valid; rebuild and request a fresh Mother signature"];

test("exact FastAPI and Receiver conflict envelopes become guarded native reasons", () => {
  for (const reason of reasons) for (const field of ["detail", "error"]) {
    const rejection = JSON.parse(JSON.stringify({ [field]: reason }));
    assert.equal(nativeConflictReason(409, rejection), reason);
  }
  assert.equal(nativeConflictReason(409, { detail: "TCAP_POOL_CAPTURE_STALE" }), null);
});

test("unrecognized, malformed, mixed and non-conflict failures never authorize re-verification", () => {
  for (const rejection of [null, [], {}, { detail: ["TCAP_POOL_CAPTURE_STALE"] },
    { detail: "prefix TCAP_POOL_CAPTURE_STALE" }, { error: "LEASE_INVALID" },
    { detail: "denied", error: "TCAP_POOL_CAPTURE_STALE" }]) assert.equal(nativeConflictReason(409, rejection), null);
  for (const status of [400, 401, 403, 404, 429, 500, 503]) assert.equal(nativeConflictReason(status, { detail: reasons[2] }), null);
});

test("only unsigned native work is eligible for a fresh Node decision", () => {
  for (const kind of ["TCAP_EPOCH_ACCOUNTING", "SETTLEMENT"]) {
    const work = { kind, verification: { verificationType: "TSN_TCAP_GPRU_HIDDEN_HEAD_V1" } };
    for (const reason of reasons) {
      assert.equal(nativeWorkRetryReason(work, new Error(reason)), reason);
      assert.equal(nativeWorkRetryReason({ ...work, result: { signature: "signed-or-uncertain" } }, new Error(reason)), null);
    }
    assert.equal(nativeWorkRetryReason(work, new Error("LEASE_INVALID")), null);
    assert.equal(nativeWorkRetryReason(work, reasons[2]), null);
  }
  for (const kind of ["AUTHORIZED_FUNDING", "TIN_OPERATION", "TCAP_FUNDING_POOL", "other"]) assert.equal(nativeWorkRetryReason({ kind }, new Error(reasons[2])), null);
  assert.equal(nativeWorkRetryReason({ kind: "SETTLEMENT", verification: { verificationType: "TSN_UNSUPPORTED_EXTERNAL" } }, new Error(reasons[2])), null);
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

test("only the signing route's exact503 service envelope becomes availability retry", () => {
  const body = { error: "TSN Node signing service is unavailable", nodeStatus: 404 };
  const reason = "TSN_NODE_SIGNING_SERVICE_UNAVAILABLE";
  assert.equal(nativeSigningAvailabilityReason("/api/cranker/settlement-signature", 503, body), reason);
  for (const status of [400, 401, 403, 404, 409, 429, 500]) {
    assert.equal(nativeSigningAvailabilityReason("/api/cranker/settlement-signature", status, body), null);
  }
  for (const route of ["/api/cranker/work", "/api/cranker/work/retry", "/other"]) {
    assert.equal(nativeSigningAvailabilityReason(route, 503, body), null);
  }
  for (const rejection of [null, [], "unavailable", {}, { detail: body.error },
    { error: "prefix " + body.error }, { error: "Receiver work was not found" }, { error: "TSN Node signing service is not configured" }]) {
    assert.equal(nativeSigningAvailabilityReason("/api/cranker/settlement-signature", 503, rejection), null);
  }
  const work = { kind: "TCAP_EPOCH_ACCOUNTING" };
  for (const result of [{ signature: "recorded" }, { wireSha256: "uncertain" }, { stage: "checkpoint" }]) {
    assert.equal(nativeWorkRetryReason({ ...work, result }, new Error(reason)), null);
  }
});
