import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import {
  diagnosticConfig, diagnosticConfigFromBody,
  failureFingerprint, createRecord,
  createAiDiagnosisRecord, createBlockedAiRecord,
  deterministicFundingDiagnosis,
  loadDiagnosticRecords, saveDiagnosticRecords,
  recordDiagnosis, calculateSessionTotals,
} from "./diagnostic-store.mjs";

function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "diag-test-"));
}

test("createRecord produces a valid record with all required fields", () => {
  const evidence = {
    relatedProgram: "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
    relatedInstruction: "deposit_with_funding_commitment_v1",
    errorCode: "6022",
    errorName: "FundingCommitmentMismatch",
  };
  const record = createRecord(evidence, "session-1");
  assert.ok(record.diagnostic_id);
  assert.equal(record.session_id, "session-1");
  assert.equal(record.provider, "DETERMINISTIC");
  assert.equal(record.status, "DETERMINISTIC_COMPLETE");
  assert.equal(record.estimated_cost_usd, 0);
  assert.equal(record.cached, false);
  assert.equal(record.blocked, false);
  assert.ok(record.failure_fingerprint);
  assert.equal(typeof record.timestamp, "string");
});

test("createAiDiagnosisRecord marks AI provider and cost", () => {
  const record = createAiDiagnosisRecord({}, "s1", 0.05);
  assert.equal(record.provider, "AI_PROVIDER");
  assert.equal(record.status, "AI_COMPLETE");
  assert.equal(record.estimated_cost_usd, 0.05);
});

test("createBlockedAiRecord marks blocked and includes reason", () => {
  const record = createBlockedAiRecord({}, "s1", "Cost limit exceeded");
  assert.equal(record.provider, "AI_PROVIDER_BLOCKED");
  assert.equal(record.status, "BLOCKED");
  assert.equal(record.blocked, true);
  assert.equal(record.blocked_reason, "Cost limit exceeded");
  assert.equal(record.estimated_cost_usd, 0);
});

test("failureFingerprint normalizes public keys and numbers", () => {
  const fp1 = failureFingerprint({
    errorCode: "6022",
    logs: "Error at line 162 with account BmBxtWpJf3FTQFGJVqHfXPbNdjMP2f6dKkWskFmCcoiP",
  });
  const fp2 = failureFingerprint({
    errorCode: "6022",
    logs: "Error at line 162 with account DiMn9UShbYd4WsdL8M3Htj9bqM9KUH9gYCZMBGjMTgX7",
  });
  assert.equal(fp1, fp2, "different pubkeys should produce same fingerprint");
});

test("createRecord redacts secrets from excerpt", () => {
  const evidence = {
    rawErrorExcerpt: "API key=sk-1234567890abcdef and private key: 5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3",
  };
  const record = createRecord(evidence, "s1");
  assert.ok(!record.raw_error_excerpt.includes("sk-1234567890abcdef"));
  assert.ok(record.raw_error_excerpt.includes("SECRET_REDACTED"));
});

test("createRecord handles empty evidence gracefully", () => {
  const record = createRecord({}, "s1");
  assert.ok(record.diagnostic_id);
  assert.equal(record.error_code, null);
  assert.equal(record.transactions_submitted, 0);
  assert.equal(record.on_chain_mutation, false);
});

test("loadDiagnosticRecords: missing file returns empty array", async () => {
  const dir = await tempDir();
  const records = await loadDiagnosticRecords(dir, "nonexistent-session");
  assert.deepEqual(records, []);
  await fs.rm(dir, { recursive: true, force: true });
});

test("loadDiagnosticRecords: malformed JSON returns empty array", async () => {
  const dir = await tempDir();
  const session = "malformed-test";
  const subdir = path.join(dir, "artifacts", "test-runs", session);
  await fs.mkdir(subdir, { recursive: true });
  await fs.writeFile(path.join(subdir, "ai-diagnostics.json"), "not valid json{{{", "utf8");
  const records = await loadDiagnosticRecords(dir, session);
  assert.deepEqual(records, []);
  await fs.rm(dir, { recursive: true, force: true });
});

test("loadDiagnosticRecords: non-array JSON returns empty array", async () => {
  const dir = await tempDir();
  const session = "non-array-test";
  const subdir = path.join(dir, "artifacts", "test-runs", session);
  await fs.mkdir(subdir, { recursive: true });
  await fs.writeFile(path.join(subdir, "ai-diagnostics.json"), '{"not":"an array"}', "utf8");
  const records = await loadDiagnosticRecords(dir, session);
  assert.deepEqual(records, []);
  await fs.rm(dir, { recursive: true, force: true });
});

test("saveDiagnosticRecords persists atomically", async () => {
  const dir = await tempDir();
  const records = [
    createRecord({ errorCode: "6022" }, "s1"),
    createRecord({ errorCode: "6022" }, "s1"),
  ];
  await saveDiagnosticRecords(dir, "s1", records);
  const loaded = await loadDiagnosticRecords(dir, "s1");
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].error_code, "6022");
  assert.equal(loaded[1].error_code, "6022");
  await fs.rm(dir, { recursive: true, force: true });
});

test("recordDiagnosis caches matching fingerprints", async () => {
  const dir = await tempDir();
  const evidence = {
    relatedProgram: "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
    relatedInstruction: "deposit_with_funding_commitment_v1",
    errorCode: "6022",
    errorName: "FundingCommitmentMismatch",
  };
  const first = await recordDiagnosis(dir, "s1", evidence, { provider: "DETERMINISTIC" });
  assert.equal(first.cached, false);
  const second = await recordDiagnosis(dir, "s1", evidence, { provider: "DETERMINISTIC" });
  assert.equal(second.cached, true);
  assert.equal(second.status, "CACHED_DETERMINISTIC_DIAGNOSIS");
  await fs.rm(dir, { recursive: true, force: true });
});

test("calculateSessionTotals aggregates correctly", () => {
  const records = [
    createRecord({ provider: "DETERMINISTIC" }, "s1"),
    { ...createRecord({ provider: "AI_PROVIDER" }, "s1"), estimated_cost_usd: 0.05, total_tokens: 500, status: "AI_COMPLETE" },
    { ...createBlockedAiRecord({}, "s1", "Cost limit"), estimated_cost_usd: 0, blocked: true },
    { ...createRecord({ provider: "DETERMINISTIC" }, "s1"), cached: true, status: "CACHED_DETERMINISTIC_DIAGNOSIS" },
  ];
  const totals = calculateSessionTotals(records);
  assert.equal(totals.totalRecords, 4);
  assert.equal(totals.deterministicCount, 2);
  assert.equal(totals.aiCallCount, 1);
  assert.equal(totals.blockedCount, 1);
  assert.equal(totals.cachedCount, 1);
  assert.equal(totals.totalEstimatedCostUsd, 0.05);
  assert.equal(totals.totalTokens, 500);
});

test("diagnosticConfig reads env vars", () => {
  process.env.AI_DIAGNOSTICS_ENABLED = "true";
  process.env.AI_MAX_COST_PER_CALL_USD = "0.25";
  const config = diagnosticConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.maxCostPerCallUsd, 0.25);
  assert.equal(config.preferredModel, "claude-3-5-sonnet-latest");
  delete process.env.AI_DIAGNOSTICS_ENABLED;
  delete process.env.AI_MAX_COST_PER_CALL_USD;
});

test("diagnosticConfigFromBody accepts partial overrides", () => {
  const config = diagnosticConfigFromBody({ enabled: true, maxCostPerSessionUsd: 1.00 });
  assert.equal(config.enabled, true);
  assert.equal(config.maxCostPerSessionUsd, 1.00);
  assert.equal(config.maxCostPerCallUsd, 0.10);
});

test("deterministicFundingDiagnosis produces expected shape", () => {
  const evidence = { errorCode: "6022", errorName: "FundingCommitmentMismatch" };
  const record = deterministicFundingDiagnosis(evidence, "s1");
  assert.equal(record.provider, "DETERMINISTIC");
  assert.equal(record.error_code, "6022");
  assert.equal(record.status, "DETERMINISTIC_COMPLETE");
  assert.equal(record.cached, false);
  assert.ok(record.diagnosis_summary.includes("rejected the supplied value"));
});
