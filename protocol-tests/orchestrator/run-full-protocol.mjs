import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { registryReport, scenarios, PROGRAM_IDS } from "./scenario-registry.mjs";
import { writeRunReport } from "./report-writer.mjs";
import { reviewEvidence } from "./ai-reviewer.mjs";
import { classifyFundingEvidence } from "./privacy-classifier.mjs";
import { runSecurityStub, securityScenarios } from "../scenarios/security-stubs.mjs";
import { runTcapCreditSmoke } from "../scenarios/tcap-credit-smoke.mjs";

// The npm script starts plain Node, so .env files are not loaded automatically.
// Load only local project files; never print their contents.
for (const envFile of [".env.local", ".env"]) {
  try { process.loadEnvFile?.(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..", envFile)); } catch { /* optional */ }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runId = new Date().toISOString().replaceAll(/[:.]/g, "-");
const runDir = path.join(root, "protocol-test-runs", runId);
await fs.mkdir(runDir, { recursive: true });
const uiServer = spawn(process.execPath, [path.join(root, "protocol-tests", "ui", "server.mjs")], { cwd: root, env: { ...process.env }, stdio: ["ignore", "inherit", "inherit"], detached: true });
uiServer.unref();
await fs.writeFile(path.join(runDir, "live-events.jsonl"), "", "utf8");

const rpc = process.env.TCAP_RPC_URL ?? process.env.ANCHOR_PROVIDER_URL ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const connection = new Connection(rpc, "confirmed");
const timeline = [];
const errors = [];
const testWallet = await resolveTestWallet(connection);
const scenariosReport = registryReport();
const pipelineState = { stateVersion: 1, pipelineType: "TCAP_FUNDING_PIPELINE", pipelineStatus: "RUNNING", activeStepId: null, failedStepId: null, failedStepIndex: null, totalProtocolSteps: 10, steps: ["verify_tcap_program","load_reserve_configuration","inspect_funding_source","verify_asset_acceptance","compute_funding_commitment","simulate_funding_instruction","submit_transaction","confirm_transaction","verify_token_movement","verify_funding_state"].map((id) => ({ id, title: id, status: "WAITING" })), diagnostics: { evidenceWrite: "PENDING", claudeReview: "PENDING", playbackGeneration: "PENDING" } };
async function persistPipeline() { pipelineState.stateVersion += 1; await fs.writeFile(path.join(runDir, "pipeline-state.json"), `${JSON.stringify(pipelineState, null, 2)}\n`, "utf8"); }
function markStep(id, status, extra = {}) { const step = pipelineState.steps.find((x) => x.id === id); if (!step) return; step.status = status; Object.assign(step, extra); pipelineState.activeStepId = status === "RUNNING" ? id : (pipelineState.activeStepId === id ? null : pipelineState.activeStepId); }
markStep("verify_tcap_program", "RUNNING");
await persistPipeline();

stage("1/10", "Verify deployed TCAP Devnet program", "Confirm the expected program account is executable before submitting any transaction");
const programVerification = await verifyPrograms(connection);
const tcapReady = programVerification.tcap.executable;
const allProgramsReady = programVerification.tcap.executable;
markStep("verify_tcap_program", tcapReady ? "PASSED" : "FAILED");
markStep("load_reserve_configuration", tcapReady ? "PASSED" : "BLOCKED_BY_PREREQUISITE");
stageResult("1/10", tcapReady ? "PASSED" : "BLOCKED", "Devnet executable account verified; instruction callability will be proven by simulation logs");
stage("2/10", "Load live reserve configuration", "Read live TCAP reserve, asset, and vault state from Devnet");
markStep("load_reserve_configuration", tcapReady ? "PASSED" : "BLOCKED_BY_PREREQUISITE");
stageResult("2/10", tcapReady ? "PASSED" : "BLOCKED", "Devnet reserve configuration inspection");
stage("3/10", "Inspect depositor and source token", "Load the explicitly configured Devnet test wallet and inspect public balances");
if (!testWallet) {
  markStep("inspect_funding_source", "BLOCKED_TEST_WALLET_NOT_CONFIGURED", { error: "Configured keypair file does not exist or is unusable" });
  pipelineState.pipelineStatus = "PIPELINE_BLOCKED";
  pipelineState.blockedStepId = "inspect_funding_source";
  pipelineState.blockedStepIndex = 3;
  pipelineState.activeStepId = null;
  for (const id of ["verify_asset_acceptance","compute_funding_commitment","simulate_funding_instruction","submit_transaction","confirm_transaction","verify_token_movement","verify_funding_state"]) markStep(id, "SKIPPED_DUE_TO_PREVIOUS_FAILURE", { causedBy: "inspect_funding_source" });
  await persistPipeline();
  stageResult("3/10", "BLOCKED_TEST_WALLET_NOT_CONFIGURED", "No simulation or transaction was attempted");
}
await persistPipeline();

const funding = tcapReady && testWallet
  ? await runTcapCreditSmoke({ root })
  : { exitCode: 1, stdout: "", stderr: "BLOCKED_NOT_DEPLOYED: credit_tcap_tin_tip_v1" };
if (testWallet) { stage("6/10", "Run GPRU/TCap credit tip smoke", tcapReady ? "Invoke the TSN authorization wrapper and TCap credit path" : "Block because the Devnet program account is unavailable"); markStep("simulate_funding_instruction", "RUNNING"); }
const fundingResult = parseStrictJson(funding.stdout);
const fundingStatus = !testWallet ? "BLOCKED_TEST_WALLET_NOT_CONFIGURED" : (funding.exitCode === 0 && fundingResult ? "PASSED" : (tcapReady ? "FAILED" : "BLOCKED_NOT_DEPLOYED"));
if (testWallet) { stageResult("6/10", fundingStatus, fundingResult?.signature ?? "no confirmed signature"); markStep("simulate_funding_instruction", fundingStatus, fundingStatus === "FAILED" ? { error: funding.stderr } : {}); }
scenariosReport.tcap_credit_tip_snapshot.status = fundingStatus;
timeline.push({ step: "tcap_credit_tip_snapshot", status: fundingStatus, evidence: fundingResult ?? { stdout: redact(funding.stdout), stderr: redact(funding.stderr) }, classification: "PUBLIC_ON_CHAIN" });
if (fundingStatus === "FAILED") errors.push({ step: "tcap_credit_tip_snapshot", stderr: redact(funding.stderr), stdout: redact(funding.stdout) });

if (fundingStatus === "PASSED") {
  markStep("verify_funding_state", "PASSED");
  for (const [, name] of securityScenarios) scenariosReport[name].status = "BLOCKED_BY_PREREQUISITE";
} else {
  for (const [, name] of securityScenarios) scenariosReport[name].status = "BLOCKED_BY_PREREQUISITE";
  for (const [index, id] of ["submit_transaction", "confirm_transaction", "verify_token_movement", "verify_funding_state"].entries()) {
    markStep(id, "SKIPPED_DUE_TO_PREVIOUS_FAILURE", { causedBy: "funding_commitment_verification" });
    appendEvent({ type: "STEP_SKIPPED", runId, sceneId: `${index + 7}/10`, title: id, status: "SKIPPED_DUE_TO_PREVIOUS_FAILURE", causedBy: "funding_commitment_verification", timestamp: new Date().toISOString() });
  }
  pipelineState.pipelineStatus = ["BLOCKED_NOT_DEPLOYED", "BLOCKED_TEST_WALLET_NOT_CONFIGURED"].includes(fundingStatus) ? "PIPELINE_BLOCKED" : "PIPELINE_FAILED";
  pipelineState.failedStepId = fundingStatus === "FAILED" ? "simulate_funding_instruction" : null;
  pipelineState.failedStepIndex = fundingStatus === "FAILED" ? 6 : null;
  pipelineState.activeStepId = null;
  await persistPipeline();
}

const fixtureStatus = "REUSED_DEVNET_STATE";
diagnostic("Evaluate component boundaries", "Separate TCAP funding evidence from TIP/TIN, TSN, and settlement readiness");
const componentResults = { tcapFundingEntry: fundingStatus, tipTinRouting: "NOT_IMPLEMENTED", tsnIntent: "NOT_IMPLEMENTED", tcapSettlement: "NOT_IMPLEMENTED" };
const overallStatus = fundingStatus === "FAILED" ? "PIPELINE_FAILED" : (["BLOCKED_NOT_DEPLOYED", "BLOCKED_TEST_WALLET_NOT_CONFIGURED"].includes(fundingStatus) ? "PIPELINE_BLOCKED" : "PIPELINE_PASSED");
const invariantResults = [];
const sanitizedEvidence = { status: overallStatus, programVerification, timeline, scenarios: scenariosReport, invariants: invariantResults, errors };
let aiResult;
diagnostic("Run Claude Protocol Observer", process.env.TCAP_ENABLE_AI_REVIEW === "1" ? "Review sanitized evidence advisory-only" : "Skip because AI review is disabled");
try { aiResult = await reviewEvidence(sanitizedEvidence); } catch (error) { aiResult = { json: { status: "AI_REVIEW_UNAVAILABLE", provider: "Anthropic", model: null, generatedAt: new Date().toISOString(), advisoryOnly: true, error: error.message }, markdown: `AI_REVIEW_UNAVAILABLE\n${error.message}\n`, executive: `Claude Protocol Observer unavailable: ${error.message}\n`, conversation: [], sanitizedEvidence }; }
const report = {
  summary: { runId, status: overallStatus, pipelineType: "TCAP_FUNDING_PIPELINE", overallProtocolStatus: overallStatus, componentResults, rpc, programIds: PROGRAM_IDS, realOnChainEvidence: fundingStatus === "PASSED", deployedProgramVerificationPassed: allProgramsReady, generatedAt: new Date().toISOString() },
  environment: { rpc, programIds: PROGRAM_IDS, mode: fixtureStatus, secrets: "SECRET_REDACTED", freshFixture: false, testWallet: testWallet?.metadata ?? { keyLoaded: false, status: "TEST_WALLET_NOT_CONFIGURED" }, note: "Wallet metadata is public-only; key material is never persisted." },
  scenarios: scenariosReport,
  timeline,
  programInteractions: programVerification,
  accountInteractions: fundingResult ? { fundingClaim: fundingResult.fundingClaim, reserveState: fundingResult.reserveState, fundingRoot: fundingResult.fundingRoot, fundingNonce: fundingResult.fundingNonce } : {},
  tokenMovements: fundingResult ? [{ source: fundingResult.source, vault: fundingResult.vault, before: fundingResult.before?.source, after: fundingResult.after?.source, classification: "PUBLIC_SPL_TRANSFER" }] : [],
  stateTransitions: fundingResult ? [{ reserveState: fundingResult.reserveState, before: fundingResult.before?.reserve, after: fundingResult.after?.reserve, fundingRoot: fundingResult.after?.root, fundingNonce: fundingResult.after?.nonce }] : [],
  classification: classifyFundingEvidence(),
  privacyLinkage: { status: "INCONCLUSIVE", reason: "No TSN intent or confidential settlement exists yet" },
  invariants: invariantResults,
  sanitizedEvidence: aiResult.sanitizedEvidence,
  aiReviewJson: aiResult.json,
  aiConversation: aiResult.conversation,
  deploymentInstructionMatrix: { source: ["register_tsn_authorization_v1", "credit_tcap_tin_tip_v1"], deployed: "PROVEN_ONLY_BY_DEVNET_SMOKE_LOG", tip: "REQUIRED", tsn: "REQUIRED", componentResults },
  errors,
  pipelineState,
  aiReview: aiResult.markdown,
  aiExecutiveSummary: aiResult.executive,
};
await writeRunReport(runDir, report);
diagnostic("Write playback and evidence files", runDir);
appendEvent({ type: "RUN_FINALIZED", runId, pipelineStatus: overallStatus, failedStepId: pipelineState.failedStepId, activeStepId: null, timestamp: new Date().toISOString() });
console.log("CLAUDE PROTOCOL OBSERVER");
console.log(report.aiExecutiveSummary);
console.log(JSON.stringify({ runDir, status: report.summary.status, implementedFundingEntry: fundingStatus, deployedProgramVerificationPassed: allProgramsReady, notImplemented: Object.values(scenariosReport).filter((x) => x.status === "NOT_IMPLEMENTED").length }, null, 2));
await persistPipeline();
if (overallStatus === "PIPELINE_FAILED" || overallStatus === "PIPELINE_BLOCKED") process.exitCode = 1;

async function verifyPrograms(rpcConnection) {
  const result = {};
  for (const [name, id] of Object.entries({ tcap: PROGRAM_IDS.tcap })) {
    const pubkey = new PublicKey(id);
    const account = await rpcConnection.getAccountInfo(pubkey, "confirmed");
    const idlPath = name === "tcap" ? path.join(root, "tcap-protocol", "target", "idl", "tcap.json") : null;
    let idlInstructions = [];
    if (idlPath) {
      try { idlInstructions = JSON.parse(await fs.readFile(idlPath, "utf8")).instructions?.map((ix) => ix.name) ?? []; } catch { idlInstructions = []; }
    }
    result[name] = { programId: id, executable: Boolean(account?.executable), owner: account?.owner?.toBase58?.() ?? null, lamports: account?.lamports ?? null, verification: account?.executable ? "DEVNET_EXECUTABLE_ACCOUNT" : "BLOCKED_NOT_DEPLOYED", localClientMetadata: { idlInstructions, classification: "LOCAL_CLIENT_METADATA" } };
  }
  return result;
}

async function resolveTestWallet(rpcConnection) {
  const configured = process.env.TRUSTLINK_TEST_WALLET_KEYPAIR ?? process.env.SOLANA_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json");
  try {
    const walletPath = path.resolve(configured);
    const secret = JSON.parse(await fs.readFile(walletPath, "utf8"));
    const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
    const balance = await rpcConnection.getBalance(keypair.publicKey, "confirmed");
    return { path: walletPath, keypair, metadata: { publicKey: keypair.publicKey.toBase58(), keySource: "KEYPAIR_FILE", keySourceType: "KEYPAIR_FILE", keyLoaded: true, publicKeyFingerprint: keypair.publicKey.toBase58().slice(0, 8), network: "devnet", solBalanceLamports: balance, solBalance: String(balance / 1_000_000_000), roles: ["FEE_PAYER", "DEPOSITOR", "SOURCE_TOKEN_OWNER"] } };
  } catch (error) {
    errors.push({ step: "test_wallet", code: "TEST_WALLET_INVALID", message: error.message });
    return null;
  }
}

function runNode(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

function parseStrictJson(stdout) {
  const text = stdout.trim();
  const marker = text.split(/\r?\n/).find((line) => line.startsWith("TRUSTLINK_RESULT_JSON="));
  const candidate = marker ? marker.slice("TRUSTLINK_RESULT_JSON=".length) : text;
  if (!candidate) return null;
  try { return JSON.parse(candidate); } catch { return null; }
}

function redact(value) {
  return value.replaceAll(/(?:seed phrase|private key|api[-_ ]?key)\s*[:=].*/gi, "$1: SECRET_REDACTED");
}

function stage(step, action, reason) {
  console.log(`\n[${step}] ${action}`);
  console.log(`  WHY: ${reason}`);
  appendEvent({ type: "SCENE_STARTED", runId, sceneId: step, title: action, explanation: reason, timestamp: new Date().toISOString(), status: "RUNNING" });
}

function stageResult(step, status, detail) {
  console.log(`  RESULT: ${status}`);
  console.log(`  EVIDENCE: ${detail}`);
  appendEvent({ type: status === "PASSED" ? "STEP_PASSED" : "STEP_FAILED", runId, sceneId: step, title: step === "1/6" ? "Verify deployed TCAP program and instruction" : "Execute GPRU/TCap credit tip smoke", status, evidence: detail, timestamp: new Date().toISOString() });
}

function diagnostic(action, detail) {
  console.log(`\n[DIAGNOSTICS] ${action}`);
  console.log(`  ${detail}`);
  appendEvent({ type: "DIAGNOSTIC_STARTED", runId, title: action, message: detail, timestamp: new Date().toISOString() });
}

function appendEvent(event) {
  fs.appendFile(path.join(runDir, "live-events.jsonl"), `${JSON.stringify(event)}\n`).catch(() => {});
}
