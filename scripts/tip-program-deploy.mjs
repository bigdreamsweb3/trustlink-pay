import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = join(root, "tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program");
const anchorPath = join(workspace, "Anchor.toml");
const anchor = readFileSync(anchorPath, "utf8");
const configuredRpc = anchor.match(/^cluster\s*=\s*"([^"]+)"/m)?.[1];
const walletConfig = anchor.match(/^wallet\s*=\s*"([^"]+)"/m)?.[1];
const programId = anchor.match(/^tins_program\s*=\s*"([^"]+)"/m)?.[1];
if (!configuredRpc || !walletConfig || !programId) {
  throw new Error(`TIP deployment settings are incomplete in ${anchorPath}`);
}

const wallet = walletConfig.startsWith("~/")
  ? join(homedir(), walletConfig.slice(2))
  : isAbsolute(walletConfig)
    ? walletConfig
    : resolve(workspace, walletConfig);
const artifact = "target/deploy/tins_program.so";
const fallbackRpc = "https://api.devnet.solana.com";
const candidates = [...new Set([configuredRpc, fallbackRpc])];

async function checkRpc(rpc) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth", params: [] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("RPC health check failed");
  const body = await response.json();
  if (body.error || body.result !== "ok") throw new Error("RPC health check failed");
}

let selectedRpc;
for (const rpc of candidates) {
  try {
    await checkRpc(rpc);
    selectedRpc = rpc;
    break;
  } catch {
    if (rpc === configuredRpc) {
      console.log("TIP configured RPC is unavailable; checking public Devnet RPC.");
    }
  }
}
if (!selectedRpc) {
  throw new Error("Configured TIP RPC and public Devnet RPC are unavailable; no deployment was attempted.");
}

const safeRpc = selectedRpc.replace(/([?&](?:api-key|key|token)=)[^&\s]+/gi, "$1<redacted>");
console.log(`TIP program deploy RPC: ${safeRpc}`);
console.log(`TIP program: ${programId}`);
const args = [
  "program", "deploy", artifact,
  "--program-id", programId,
  "--keypair", wallet,
  "--upgrade-authority", wallet,
  "--max-sign-attempts", "20",
  "--commitment", "confirmed",
  "--url", selectedRpc,
  "--use-rpc",
];

function redact(text) {
  return text.replace(/([?&](?:api-key|key|token)=)[^&\s)]+/gi, "$1<redacted>");
}

function forwardRedacted(stream, destination) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/([\r\n])/);
    pending = lines.pop() ?? "";
    for (let i = 0; i < lines.length; i += 2) {
      destination.write(redact(lines[i]) + (lines[i + 1] ?? ""));
    }
  });
  stream.on("end", () => {
    if (pending) destination.write(redact(pending));
  });
}

await new Promise((resolveDeploy, rejectDeploy) => {
  const child = spawn("solana", args, { cwd: workspace, stdio: ["inherit", "pipe", "pipe"] });
  forwardRedacted(child.stdout, process.stdout);
  forwardRedacted(child.stderr, process.stderr);
  child.once("error", () => rejectDeploy(new Error("Could not start the Solana CLI for TIP deployment.")));
  child.once("close", (code) => {
    if (code === 0) resolveDeploy();
    else rejectDeploy(new Error(`TIP deployment command exited with status ${code ?? "unknown"}.`));
  });
});
