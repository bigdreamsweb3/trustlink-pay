import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULTS = Object.freeze({
  enabled: false,
  maxCallsPerTestRun: 1,
  maxCallsPerSession: 5,
  maxInputTokens: 12000,
  maxOutputTokens: 2000,
  maxCostPerCallUsd: 0.10,
  maxCostPerSessionUsd: 0.50,
  preferredModel: "claude-3-5-sonnet-latest",
});

function numericEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function diagnosticConfig() {
  return {
    enabled: process.env.AI_DIAGNOSTICS_ENABLED === "true" ? true : DEFAULTS.enabled,
    automaticDiagnosis: process.env.AI_AUTOMATIC_DIAGNOSIS === "true",
    maxCallsPerTestRun: numericEnv("AI_MAX_CALLS_PER_TEST_RUN", DEFAULTS.maxCallsPerTestRun),
    maxCallsPerSession: numericEnv("AI_MAX_CALLS_PER_SESSION", DEFAULTS.maxCallsPerSession),
    maxInputTokens: numericEnv("AI_MAX_INPUT_TOKENS", DEFAULTS.maxInputTokens),
    maxOutputTokens: numericEnv("AI_MAX_OUTPUT_TOKENS", DEFAULTS.maxOutputTokens),
    maxCostPerCallUsd: numericEnv("AI_MAX_COST_PER_CALL_USD", DEFAULTS.maxCostPerCallUsd),
    maxCostPerSessionUsd: numericEnv("AI_MAX_COST_PER_SESSION_USD", DEFAULTS.maxCostPerSessionUsd),
    preferredModel: process.env.AI_DIAGNOSTICS_MODEL ?? DEFAULTS.preferredModel,
  };
}

export function diagnosticConfigFromBody(body) {
  return {
    enabled: typeof body.enabled === "boolean" ? body.enabled : DEFAULTS.enabled,
    automaticDiagnosis: typeof body.automaticDiagnosis === "boolean" ? body.automaticDiagnosis : false,
    maxCallsPerTestRun: Number.isFinite(body.maxCallsPerTestRun) ? body.maxCallsPerTestRun : DEFAULTS.maxCallsPerTestRun,
    maxCallsPerSession: Number.isFinite(body.maxCallsPerSession) ? body.maxCallsPerSession : DEFAULTS.maxCallsPerSession,
    maxInputTokens: Number.isFinite(body.maxInputTokens) ? body.maxInputTokens : DEFAULTS.maxInputTokens,
    maxOutputTokens: Number.isFinite(body.maxOutputTokens) ? body.maxOutputTokens : DEFAULTS.maxOutputTokens,
    maxCostPerCallUsd: Number.isFinite(body.maxCostPerCallUsd) ? body.maxCostPerCallUsd : DEFAULTS.maxCostPerCallUsd,
    maxCostPerSessionUsd: Number.isFinite(body.maxCostPerSessionUsd) ? body.maxCostPerSessionUsd : DEFAULTS.maxCostPerSessionUsd,
    preferredModel: typeof body.preferredModel === "string" ? body.preferredModel : DEFAULTS.preferredModel,
  };
}

function safeExcerpt(value, limit = 700) {
  return String(value ?? "")
    .replaceAll(/(?:api[-_ ]?key|private key|seed phrase|secret key|mnemonic)\s*[:=]\s*[^\s,]+/gi, "SECRET_REDACTED")
    .replaceAll(/[1-9A-HJ-NP-Za-km-z]{32,}/g, (match) => {
      if (match.length >= 44) return "<PUBLIC_KEY>";
      return match;
    })
    .slice(0, limit);
}

export function failureFingerprint(evidence) {
  const normalizedLogs = safeExcerpt(evidence.rawErrorExcerpt ?? evidence.logs ?? "")
    .replaceAll(/[1-9A-HJ-NP-Za-km-z]{32,}/g, "<PUBLIC_KEY>")
    .replaceAll(/\d+/g, "<NUMBER>");
  return createHash("sha256").update(JSON.stringify({
    program: evidence.relatedProgram ?? null,
    instruction: evidence.relatedInstruction ?? null,
    errorCode: evidence.errorCode ?? null,
    errorName: evidence.errorName ?? null,
    normalizedLogs,
    deployedBinary: evidence.deployedBinary ?? null,
  })).digest("hex");
}

export function createRecord(evidence, sessionId, overrides = {}) {
  const fingerprint = failureFingerprint(evidence);
  return {
    diagnostic_id: randomUUID(),
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    provider: evidence.provider ?? overrides.provider ?? "DETERMINISTIC",
    model: evidence.model ?? overrides.model ?? "NONE",
    purpose: evidence.purpose ?? overrides.purpose ?? "Unknown",
    triggered_by: evidence.triggered_by ?? "USER_REQUESTED_DIAGNOSIS",
    related_program: evidence.relatedProgram ?? overrides.relatedProgram ?? null,
    related_instruction: evidence.relatedInstruction ?? overrides.relatedInstruction ?? null,
    related_transaction_signature: evidence.relatedTransactionSignature ?? null,
    test_stage: evidence.testStage ?? overrides.testStage ?? null,
    input_summary: evidence.inputSummary ?? overrides.inputSummary ?? "",
    evidence_references: evidence.references ?? overrides.references ?? [],
    error_code: evidence.errorCode ?? null,
    error_name: evidence.errorName ?? null,
    raw_error_excerpt: safeExcerpt(evidence.rawErrorExcerpt ?? ""),
    diagnosis_summary: evidence.diagnosisSummary ?? overrides.diagnosisSummary ?? "",
    possible_causes: evidence.possibleCauses ?? overrides.possibleCauses ?? [],
    recommended_next_step: evidence.recommendedNextStep ?? overrides.recommendedNextStep ?? "",
    confidence_level: evidence.confidenceLevel ?? overrides.confidenceLevel ?? "MEDIUM",
    uncertainty_notes: evidence.uncertaintyNotes ?? overrides.uncertaintyNotes ?? "",
    files_read: evidence.filesRead ?? overrides.filesRead ?? [],
    files_modified: evidence.filesModified ?? overrides.filesModified ?? [],
    commands_run: evidence.commandsRun ?? overrides.commandsRun ?? [],
    transactions_submitted: evidence.transactionsSubmitted ?? 0,
    on_chain_mutation: evidence.onChainMutation ?? false,
    prompt_tokens: evidence.promptTokens ?? 0,
    completion_tokens: evidence.completionTokens ?? 0,
    total_tokens: (evidence.promptTokens ?? 0) + (evidence.completionTokens ?? 0),
    estimated_cost_usd: evidence.estimatedCostUsd ?? overrides.estimatedCostUsd ?? 0,
    duration_ms: evidence.durationMs ?? 0,
    status: overrides.status ?? "DETERMINISTIC_COMPLETE",
    failure_reason: evidence.failureReason ?? overrides.failureReason ?? null,
    failure_fingerprint: fingerprint,
    cached: overrides.cached ?? false,
    blocked: overrides.blocked ?? false,
    blocked_reason: overrides.blockedReason ?? null,
    evidence_class: evidence.evidenceClass ?? "UNKNOWN",
    ...Object.fromEntries(
      Object.entries(overrides).filter(([k]) => ![
        "provider","model","purpose","cached","blocked","blockedReason","status",
        "estimatedCostUsd","diagnosisSummary","possibleCauses","recommendedNextStep",
        "confidenceLevel","inputSummary","testStage","relatedProgram","relatedInstruction",
        "references","filesRead","filesModified","commandsRun",
      ].includes(k))
    ),
  };
}

export function createAiDiagnosisRecord(evidence, sessionId, estimatedCostUsd = 0) {
  return createRecord(evidence, sessionId, {
    provider: "AI_PROVIDER",
    status: "AI_COMPLETE",
    estimatedCostUsd,
  });
}

export function createBlockedAiRecord(evidence, sessionId, blockedReason) {
  return createRecord(evidence, sessionId, {
    provider: "AI_PROVIDER_BLOCKED",
    status: "BLOCKED",
    blocked: true,
    blockedReason,
    estimatedCostUsd: 0,
    diagnosisSummary: "Blocked: " + blockedReason,
  });
}

export function deterministicFundingDiagnosis(evidence, sessionId) {
  return createRecord(evidence, sessionId, {
    provider: "DETERMINISTIC",
    model: "NONE",
    purpose: "Funding commitment mismatch triage",
    relatedProgram: evidence.relatedProgram ?? "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
    relatedInstruction: evidence.relatedInstruction ?? "deposit_with_funding_commitment_v1",
    testStage: evidence.testStage ?? "funding_simulation",
    inputSummary: "Compare deterministic V1 commitment inputs against the shared fixed public vector before another Devnet simulation.",
    references: evidence.references ?? ["docs/FUNDING-COMMITMENT-MISMATCH-6022.md", "test-vectors/tcap-funding-commitment.json"],
    diagnosisSummary: "The deployed TCAP program reached the V1 funding handler during Devnet simulation, reconstructed a funding commitment from the submitted fields, and rejected the supplied value. No transaction was submitted or confirmed.",
    possibleCauses: [
      "Client and program preimage field order differs",
      "A u16, u32, or u64 field uses non-little-endian encoding",
      "Amount, nonce, expiry, authorization, domain, or account binding differs",
      "The client builder does not match the deployed V1 binary",
    ],
    recommendedNextStep: "Run the shared fixed vector in JavaScript and Rust, then capture a field-offset comparison for the live instruction before simulating again.",
    confidenceLevel: "HIGH",
    uncertaintyNotes: "The historical simulation did not expose either full preimage or the program-recomputed hash, so the differing field is not yet proven.",
    filesRead: ["tcap-protocol/programs/tcap/src/funding.rs", "tcap-protocol/scripts/devnet-funding-claim.mjs"],
    status: "DETERMINISTIC_COMPLETE",
    evidenceClass: "DEVNET_SIMULATION_EVIDENCE",
    estimatedCostUsd: 0,
    errorCode: evidence.errorCode ?? "6022",
    errorName: evidence.errorName ?? "FundingCommitmentMismatch",
    rawErrorExcerpt: evidence.rawErrorExcerpt ?? "Devnet simulation returned FundingCommitmentMismatch (6022 / 0x1786).",
  });
}

export async function loadDiagnosticRecords(root, sessionId) {
  const filename = path.join(root, "artifacts", "test-runs", sessionId, "ai-diagnostics.json");
  try {
    const raw = await fs.readFile(filename, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

export async function saveDiagnosticRecords(root, sessionId, records) {
  const directory = path.join(root, "artifacts", "test-runs", sessionId);
  await fs.mkdir(directory, { recursive: true });
  const tmp = path.join(directory, "ai-diagnostics.json.tmp");
  await fs.writeFile(tmp, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await fs.rename(tmp, path.join(directory, "ai-diagnostics.json"));
}

export async function recordDiagnosis(root, sessionId, evidence, overrides = {}) {
  const records = await loadDiagnosticRecords(root, sessionId);
  const candidate = createRecord(evidence, sessionId, overrides);
  const cached = records.find((record) =>
    record.failure_fingerprint === candidate.failure_fingerprint
    && record.status !== "FAILED"
    && record.status !== "BLOCKED"
  );
  if (cached) {
    const record = {
      ...candidate,
      diagnostic_id: randomUUID(),
      timestamp: new Date().toISOString(),
      cached: true,
      status: "CACHED_DETERMINISTIC_DIAGNOSIS",
      estimated_cost_usd: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    records.push(record);
    await saveDiagnosticRecords(root, sessionId, records);
    return record;
  }
  records.push(candidate);
  await saveDiagnosticRecords(root, sessionId, records);
  return candidate;
}

export async function recordFundingDiagnosis(root, sessionId, evidence) {
  return recordDiagnosis(root, sessionId, evidence, {
    provider: "DETERMINISTIC",
    model: "NONE",
    purpose: "Funding commitment mismatch triage",
    relatedProgram: "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
    relatedInstruction: "deposit_with_funding_commitment_v1",
    testStage: "funding_simulation",
    diagnosisSummary: "The deployed TCAP program reached the V1 funding handler during Devnet simulation, reconstructed a funding commitment from the submitted fields, and rejected the supplied value.",
    confidenceLevel: "HIGH",
    status: "DETERMINISTIC_COMPLETE",
    evidenceClass: "DEVNET_SIMULATION_EVIDENCE",
  });
}

export async function readDiagnosticRecord(root, sessionId, diagnosticId) {
  const records = await loadDiagnosticRecords(root, sessionId);
  return records.find((record) => record.diagnostic_id === diagnosticId) ?? null;
}

export function calculateSessionTotals(records) {
  const callRecords = records.filter((r) => r.provider !== "DETERMINISTIC" && r.provider !== "CACHED_DETERMINISTIC_DIAGNOSIS");
  return {
    totalRecords: records.length,
    deterministicCount: records.filter((r) => r.provider === "DETERMINISTIC" || r.status === "CACHED_DETERMINISTIC_DIAGNOSIS").length,
    aiCallCount: callRecords.filter((r) => r.status === "AI_COMPLETE" || r.status === "AI_FAILED").length,
    blockedCount: records.filter((r) => r.blocked === true).length,
    cachedCount: records.filter((r) => r.cached === true).length,
    totalEstimatedCostUsd: callRecords.reduce((sum, r) => sum + (r.estimated_cost_usd ?? 0), 0),
    totalTokens: records.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0),
  };
}
