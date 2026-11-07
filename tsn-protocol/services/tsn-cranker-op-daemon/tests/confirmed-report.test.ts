import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ConfirmedReceiptReportPending, RetryableConfirmedReportError, confirmedReportAvailabilityError, sendConfirmedWorkReport } from "../src/receiver/confirmed-report.js";

const noDelay = { wait: async () => {} };

test("successful receipt report completes once", async () => {
  let calls = 0;
  await sendConfirmedWorkReport(async () => { calls++; }, "work", "signature");
  assert.equal(calls, 1);
});

test("finality lag retries only the same confirmation report", async () => {
  let calls = 0;
  const delays: number[] = [];
  const body = Object.freeze({ id: "work", expectedVersion: 8, status: "CONFIRMED", signature: "signature" });
  const bodies: unknown[] = [];
  await sendConfirmedWorkReport(async signal => {
    assert.ok(signal instanceof AbortSignal);
    bodies.push(body);
    if (++calls < 4) throw new RetryableConfirmedReportError("Finalized receipt unavailable");
  }, body.id, body.signature, { wait: async ms => { delays.push(ms); } });
  assert.equal(calls, 4);
  assert.deepEqual(delays, [5000, 5000, 5000]);
  assert.ok(bodies.every(value => value === body));
});

test("a lost accepted response can replay its receipt without another transaction", async () => {
  for (const message of ["fetch failed", "terminated"]) {
    let reports = 0, writes = 0;
    await sendConfirmedWorkReport(async () => {
      reports++;
      if (writes === 0) { writes++; throw new TypeError(message); }
    }, "work", "signature", noDelay);
    assert.equal(reports, 2);
    assert.equal(writes, 1);
  }
});

test("persistent availability failure stops after six reports and keeps the signature", async () => {
  let calls = 0;
  await assert.rejects(sendConfirmedWorkReport(async () => {
    calls++;
    throw new RetryableConfirmedReportError("private upstream context");
  }, "work", "signature", noDelay), error => {
    assert.ok(error instanceof ConfirmedReceiptReportPending);
    assert.equal(error.workId, "work");
    assert.equal(error.signature, "signature");
    assert.ok(!error.message.includes("private upstream context"));
    return true;
  });
  assert.equal(calls, 6);
});

test("each report has a deadline even while authentication is pending", async () => {
  let calls = 0;
  await assert.rejects(sendConfirmedWorkReport(async signal => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 10));
    signal.throwIfAborted();
  }, "work", "signature", { ...noDelay, timeoutMs: 1, attempts: 2 }), ConfirmedReceiptReportPending);
  assert.equal(calls, 2);
});

test("authorization and receipt mismatches remain pending without retries", async () => {
  for (const reason of ["LEASE_INVALID", "STALE_STATE_VERSION", "SETTLEMENT_RECEIPT_MEMO_MISMATCH", "SETTLEMENT_SUBMISSION_SIGNATURE_MISMATCH", "CRANKER_SESSION_INVALID", 'Receiver request failed (403): {"error":"fetch failed authentication"}']) {
    let calls = 0;
    await assert.rejects(sendConfirmedWorkReport(async () => {
      calls++;
      throw new Error(reason);
    }, "work", "signature", noDelay), ConfirmedReceiptReportPending);
    assert.equal(calls, 1);
    assert.equal(confirmedReportAvailabilityError(409, reason), false);
  }
  assert.equal(confirmedReportAvailabilityError(409, "SETTLEMENT_RECONCILIATION_RPC_RECEIPT_UNAVAILABLE"), true);
  assert.equal(confirmedReportAvailabilityError(409, "SETTLEMENT_RECONCILIATION_RPC_UNAVAILABLE"), true);
  for (const status of [429, 500, 502, 503, 504]) assert.equal(confirmedReportAvailabilityError(status), true);
  for (const status of [400, 401, 403, 404]) assert.equal(confirmedReportAvailabilityError(status), false);
});

test("daemon handles pending confirmation before its FAILED report branch", async () => {
  const source = await readFile(new URL("../scripts/cranker.ts", import.meta.url), "utf8");
  assert.match(source, /status === "CONFIRMED"[\s\S]*sendConfirmedWorkReport/);
  assert.match(source, /error instanceof ConfirmedReceiptReportPending[\s\S]*?continue;[\s\S]*?await report\(signer, work, "FAILED"/);
});
