import { spawn } from "node:child_process";

export async function runFundingEntrySuccess({ root, rpc, programIds }) {
  const script = `${root}/tcap-protocol/scripts/devnet-funding-claim.mjs`;
  const child = spawn(process.execPath, [script], { cwd: root, env: { ...process.env, TCAP_RPC_URL: rpc }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  const text = stdout.trim();
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* malformed evidence is a failure */ }
  return {
    scenario: "funding_entry_success",
    status: exitCode === 0 && payload ? "PASSED" : "FAILED",
    expectedOutcome: "confirmed funding deposit and funding claim",
    observedOutcome: payload,
    submitted: exitCode === 0,
    signatures: payload?.signature ? [payload.signature] : [],
    confirmedSlots: payload?.slot ? [payload.slot] : [],
    programIds,
    accounts: payload ? { fundingClaim: payload.fundingClaim, reserveState: payload.reserveState, fundingRoot: payload.fundingRoot } : {},
    stateBefore: payload?.before ?? null,
    stateAfter: payload?.after ?? null,
    invariantResults: [],
    error: exitCode === 0 && payload ? null : { code: "MALFORMED_OR_FAILED_EXECUTOR", stderr: stderr.trim() },
    evidenceClassification: exitCode === 0 && payload ? "PUBLIC_ON_CHAIN" : "NO_CHAIN_EVIDENCE",
  };
}
