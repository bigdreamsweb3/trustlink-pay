import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = resolve(process.cwd());
const operation = ["build", "deploy"].includes(process.argv[2]) ? process.argv[2] : "deploy";
const requested = ["build", "deploy"].includes(process.argv[2]) ? (process.argv[3] ?? "all") : (process.argv[2] ?? "all");
const plans = {
  tsn: {
    label: "TSN",
    workspace: "tsn-protocol/programs/tsn/protocol",
    anchor: "tsn-protocol/programs/tsn/protocol/Anchor.toml",
    program: "trustlink_escrow",
    programId: "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
    artifact: "tsn-protocol/programs/tsn/protocol/target/deploy/trustlink_escrow.so",
    artifactRelative: "target/deploy/trustlink_escrow.so",
    keypair: "target/deploy/trustlink_escrow-keypair.json",
  },
  tcap: {
    label: "TCap",
    workspace: "tsn-protocol/programs/tcap-protocol",
    anchor: "tsn-protocol/programs/tcap-protocol/Anchor.toml",
    program: "tcap",
    programId: "tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF",
    artifact: "tsn-protocol/programs/tcap-protocol/target/deploy/tcap.so",
    artifactRelative: "target/deploy/tcap.so",
    keypair: "target/deploy/tcap-keypair.json",
  },
  gpru: {
    label: "GPRU",
    workspace: "tsn-protocol/programs/gpru",
    anchor: "tsn-protocol/programs/gpru/Anchor.toml",
    program: "tsn_gpru_proof_contract",
    programId: "6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR",
    artifact: "tsn-protocol/programs/gpru/target/deploy/tsn_gpru_proof_contract.so",
    artifactRelative: "target/deploy/tsn_gpru_proof_contract.so",
    keypair: "gpru-program-keys/gpru-program-keypair.json",
  },
};

const devnetGenesisHash = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const publicDevnetRpc = "https://api.devnet.solana.com";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function toWslPath(value) {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(value);
  if (!match) return value.replaceAll("\\", "/");
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

function displayArgs(args) {
  return args.map(redactRpcCredentials);
}

function redactRpcCredentials(value) {
  return String(value).replace(/https?:\/\/[^\s\\)]+/gi, safeRpc);
}

function useWslForPrograms() {
  return process.platform === "win32" && process.env.TSN_NATIVE_SOLANA_TOOLS !== "1";
}

function runProgram(command, args, cwd, label, env = {}, capture = false, timeout) {
  const mergedEnv = { ...process.env, ...env };
  if (!useWslForPrograms()) {
    console.log(`\n[devnet] ${label}`);
    console.log(`[devnet] $ ${command} ${displayArgs(args).join(" ")}`);
    const result = spawnSync(command, args, { cwd, env: mergedEnv, encoding: capture ? "utf8" : undefined, stdio: capture ? "pipe" : "inherit", timeout });
    if (result.error) throw commandStartError(label, result.error);
    if (result.status !== 0) {
      const error = new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
      error.commandOutput = redactRpcCredentials(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim());
      throw error;
    }
    return capture ? result.stdout.trim() : "";
  }

  const assignmentEntries = Object.entries(env)
    .filter(([key]) => ["ANCHOR_PROVIDER_URL", "ANCHOR_WALLET", "SOLANA_WALLET"].includes(key))
    .map(([key, value]) => [key, key.includes("WALLET") ? toWslPath(value) : value]);
  const assignments = assignmentEntries.map(([key, value]) => `export ${key}=${shellQuote(value)}`).join(" && ");
  const unixCwd = toWslPath(cwd);
  const unixArgs = args.map((arg) => /^[A-Za-z]:[\\/]/.test(arg) ? toWslPath(arg) : arg);
  const unixCommand = [command, ...unixArgs].map(shellQuote).join(" ");
  const script = `${assignments ? `${assignments} && ` : ""}cd ${shellQuote(unixCwd)} && ${unixCommand}`;
  console.log(`\n[devnet] ${label}`);
  const loggedAssignments = assignmentEntries.map(([key, value]) => `export ${key}=${shellQuote(redactRpcCredentials(value))}`).join(" && ");
  const loggedCommand = [command, ...displayArgs(unixArgs)].map(shellQuote).join(" ");
  const loggedScript = `${loggedAssignments ? `${loggedAssignments} && ` : ""}cd ${shellQuote(unixCwd)} && ${loggedCommand}`;
  console.log(`[devnet] wsl.exe bash -lc ${shellQuote(loggedScript)}`);
  const result = spawnSync("wsl.exe", ["bash", "-lc", script], { encoding: capture ? "utf8" : undefined, env: process.env, stdio: capture ? "pipe" : "inherit", timeout });
  if (result.error) throw commandStartError(label, result.error);
  if (result.status !== 0) {
    const error = new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
    error.commandOutput = redactRpcCredentials(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim());
    throw error;
  }
  return capture ? result.stdout.trim() : "";
}

function commandStartError(label, cause) {
  // Raw spawn errors include spawnargs, which can contain provider credentials.
  const error = new Error(`${label} could not run: ${redactRpcCredentials(cause.message)}`);
  error.commandOutput = redactRpcCredentials(`${cause.code ?? ""} ${cause.message}`);
  return error;
}

function isRpcAvailabilityError(error) {
  const output = `${error.message ?? ""}\n${error.commandOutput ?? ""}`;
  if (/unauthorized|forbidden|invalid (?:api[- ]?key|params|request)|certificate|TLS|SSL/i.test(output)) return false;
  // Status codes need HTTP context: an account error mentioning 512 bytes is
  // not an unavailable RPC, and a hostname can legitimately contain "401".
  const httpStatus = output.match(/\b(?:HTTP(?:\/[\d.]+)?(?:\s+(?:status|response))?(?:\s+(?:client|server))?(?:\s+error)?|status(?:\s+code)?)\s*[:=( ]+\s*(\d{3})\b/i)?.[1];
  if (httpStatus === "401" || httpStatus === "403") return false;
  return httpStatus === "429" || /^5\d\d$/.test(httpStatus ?? "") ||
    /dns error|failed to (?:lookup|resolve)|name or service not known|temporary failure in name resolution|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|timed? ?out|connection (?:reset|refused|closed)|network is unreachable|no route to host|too many requests|service unavailable|bad gateway|gateway timeout/i.test(output);
}

function rpcReadAttempts() {
  const value = process.env.TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS ?? "3";
  if (!/^[1-5]$/.test(value)) throw new Error("TRUSTLINK_DEPLOY_RPC_READ_ATTEMPTS must be an integer from 1 to 5.");
  return Number(value);
}

function recoveryRounds() {
  const value = process.env.TRUSTLINK_DEPLOY_RECOVERY_ROUNDS ?? "3";
  if (!/^[1-5]$/.test(value)) throw new Error("TRUSTLINK_DEPLOY_RECOVERY_ROUNDS must be an integer from 1 to 5.");
  return Number(value);
}

async function runRpcRead(commandArgs, workspace, label, env) {
  const attempts = rpcReadAttempts();
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return runProgram("solana", commandArgs, workspace, label, env, true, 30_000);
    } catch (error) {
      if (!isRpcAvailabilityError(error) || attempt === attempts) throw error;
      const delay = Math.min(2_000 * 2 ** (attempt - 1), 8_000);
      console.warn(`[devnet] ${label}: temporary RPC failure (${attempt}/${attempts}); retrying in ${delay / 1000}s. ${error.commandOutput ?? error.message}`);
      await new Promise((done) => setTimeout(done, delay));
    }
  }
}

function readAnchorConfig(relativePath) {
  const body = readFileSync(join(root, relativePath), "utf8");
  const cluster = body.match(/^cluster\s*=\s*"([^"]+)"/m)?.[1];
  const wallet = body.match(/^wallet\s*=\s*"([^"]+)"/m)?.[1];
  return { cluster, wallet };
}

function resolveRpc(plan) {
  const configuredCluster = readAnchorConfig(plan.anchor).cluster;
  return process.env.TRUSTLINK_DEPLOY_RPC_URL
    ?? configuredCluster
    ?? process.env.ANCHOR_PROVIDER_URL
    ?? process.env.SOLANA_RPC_URL
    ?? (() => { throw new Error("No Devnet RPC found. Set ANCHOR_PROVIDER_URL or use the workspace Anchor.toml cluster."); })();
}

function safeRpc(rpc) {
  try {
    const url = new URL(rpc);
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : "/<redacted>"}${url.search ? "?<redacted>" : ""}`;
  } catch {
    return "<unparseable-rpc>";
  }
}

async function inspectDeploymentRpc(plan, preferredRpc, wallet, programId) {
  const workspace = join(root, plan.workspace);
  const fallback = process.env.TRUSTLINK_DEPLOY_RPC_FALLBACK_URL ?? publicDevnetRpc;
  const candidates = [...new Set([preferredRpc, ...(fallback === "none" ? [] : [fallback])])];
  for (let index = 0; index < candidates.length; index += 1) {
    const rpc = candidates[index];
    const env = { ANCHOR_PROVIDER_URL: rpc, ANCHOR_WALLET: wallet, SOLANA_WALLET: wallet };
    try {
      const genesis = await runRpcRead(["genesis-hash", "--url", rpc], workspace, `Verify ${plan.label} Devnet RPC genesis`, env);
      if (genesis !== devnetGenesisHash) {
        throw new Error(`${plan.label} RPC ${safeRpc(rpc)} is not verified Devnet (unexpected genesis hash). No deployment started.`);
      }
      let currentShow;
      try {
        currentShow = await runRpcRead(["program", "show", "--url", rpc, programId], workspace, `Inspect ${plan.label} ProgramData capacity`, env);
      } catch (error) {
        if (!/AccountNotFound|Unable to find (?:the )?account|account .* not found/i.test(error.commandOutput ?? "")) throw error;
        console.log(`${plan.label} program ${programId} is not deployed; preparing initial deployment.`);
        return { rpc, env, currentShow: "", initialDeploy: true };
      }
      if (!/Data Length:\s*[\d,]+/.test(currentShow)) {
        throw new Error(`${plan.label} ProgramData capacity could not be parsed. No deployment started.`);
      }
      console.log(`[devnet] Selected verified Devnet RPC: ${safeRpc(rpc)}`);
      return { rpc, env, currentShow, initialDeploy: false };
    } catch (error) {
      if (!isRpcAvailabilityError(error) || index === candidates.length - 1) throw error;
      console.warn(`[devnet] RPC ${safeRpc(rpc)} remained unavailable; checking Devnet backup ${safeRpc(candidates[index + 1])}. ${error.commandOutput ?? error.message}`);
    }
  }
}

function resolveWallet(plan) {
  const configured = process.env.ANCHOR_WALLET ?? process.env.SOLANA_WALLET ?? readAnchorConfig(plan.anchor).wallet;
  if (!configured) throw new Error("No wallet found. Set ANCHOR_WALLET or SOLANA_WALLET.");
  const expanded = configured.startsWith("~/")
    ? join(process.env.HOME ?? process.env.USERPROFILE ?? "", configured.slice(2))
    : configured;
  const wallet = isAbsolute(expanded) ? expanded : resolve(root, expanded);
  if (!existsSync(wallet)) throw new Error(`Wallet file not found: ${wallet}`);
  return wallet;
}

function programIdFromKeypair(plan) {
  const keypairPath = join(root, plan.workspace, plan.keypair);
  if (!existsSync(keypairPath)) {
    throw new Error(`Program keypair missing: ${keypairPath}`);
  }
  const output = runProgram("solana", ["address", "-k", plan.keypair], join(root, plan.workspace), `Verify ${plan.label} program ID`, {}, true);
  if (plan.programId && output !== plan.programId) {
    throw new Error(`${plan.label} keypair resolves to ${output}, expected ${plan.programId}`);
  }
  return output;
}

function printPlan(plan, rpc, wallet) {
  console.log(`\n=== ${plan.label} Devnet deployment ===`);
  console.log(`cwd: ${join(root, plan.workspace)}`);
  console.log(`rpc: ${safeRpc(rpc)}`);
  console.log(`cluster policy: Devnet only`);
  console.log(`wallet: ${wallet}`);
  console.log(`program: ${plan.program}`);
  console.log(`program id: ${plan.programId ?? "read from the GPRU deployment keypair"}`);
  console.log(`build: ${plan.buildCommand ? plan.buildCommand.join(" ") : "anchor build --no-idl"}`);
  if (!plan.buildCommand) console.log("note: IDL generation skipped due to host toolchain compatibility; deploying SBF artifact only.");
}

function build(plan) {
  const rpc = resolveRpc(plan);
  const wallet = resolveWallet(plan);
  printPlan(plan, rpc, wallet);
  runProgram("npm", ["run", "deploy:lockfiles:stabilize"], root, "Re-stabilize deploy lockfiles immediately before build", { ANCHOR_PROVIDER_URL: rpc, ANCHOR_WALLET: wallet, SOLANA_WALLET: wallet });
  const lockfilePath = join(root, plan.workspace, "Cargo.lock");
  if (existsSync(lockfilePath)) {
    const lockfile = readFileSync(lockfilePath, "utf8");
    const lockVersion = lockfile.match(/^version = (\d+)$/m)?.[1];
    if (lockVersion !== "3") {
      throw new Error(`${lockfilePath} must use Cargo.lock format version 3 before the Solana/SBF 1.18.x build; found ${lockVersion ?? "unknown"}.`);
    }
  }
  if (plan.buildCommand) {
    runProgram(plan.buildCommand[0], plan.buildCommand.slice(1), join(root, plan.workspace), `Build ${plan.label} SBF program`, { ANCHOR_PROVIDER_URL: rpc, ANCHOR_WALLET: wallet, SOLANA_WALLET: wallet });
  } else {
    runProgram("anchor", ["build", "--no-idl"], join(root, plan.workspace), `Build ${plan.label} program with --no-idl`, { ANCHOR_PROVIDER_URL: rpc, ANCHOR_WALLET: wallet, SOLANA_WALLET: wallet });
  }
  const artifact = join(root, plan.artifact);
  if (!existsSync(artifact)) throw new Error(`SBF artifact was not produced: ${artifact}`);
  console.log(`artifact: ${artifact}`);
  const programId = programIdFromKeypair(plan);
  return { rpc, wallet, programId, artifact };
}

function ensureBufferSigner(plan, workspace) {
  const configured = process.env.TRUSTLINK_DEPLOY_BUFFER_SIGNER;
  const path = configured ?? join(tmpdir(), `trustlink-${plan.program}-buffer-signer.json`);
  const generated = !configured;
  if (!existsSync(path)) {
    console.log(`creating persistent deploy buffer signer: ${path}`);
    runProgram("solana-keygen", ["new", "--no-bip39-passphrase", "--silent", "-o", path], workspace, `Create ${plan.label} deploy buffer signer`);
    runProgram("chmod", ["600", path], workspace, `Protect ${plan.label} deploy buffer signer`);
  } else {
    console.log(`reusing deploy buffer signer: ${path}`);
  }
  return { path, generated };
}

function deployWithRecovery(plan, deployArgs, workspace, env, preferredTransport, bufferSigner) {
  const transports = preferredTransport === "quic" ? ["quic", "rpc"] : ["rpc", "quic"];
  const rounds = recoveryRounds();

  let lastError;
  for (let round = 1; round <= rounds; round += 1) {
    for (const transport of transports) {
      const transportFlag = transport === "quic" ? "--use-quic" : "--use-rpc";
      console.log(`\n[devnet] Upload recovery attempt ${round}/${rounds} via ${transport.toUpperCase()} (same buffer signer)`);
      try {
        runProgram("solana", [...deployArgs, "--buffer", bufferSigner, transportFlag], workspace, `Deploy ${plan.label} SBF artifact via ${transport.toUpperCase()}`, env);
        return;
      } catch (error) {
        lastError = error;
        console.warn(`[devnet] ${transport.toUpperCase()} upload failed; trying the next recovery path.`);
      }
    }
  }

  throw new Error(
    `${plan.label} deployment exhausted ${rounds * transports.length} upload attempts. ` +
    `Inspect deployed program state before resuming; the upload outcome is uncertain. ` +
    `The buffer signer is retained at ${bufferSigner}. Resume with TRUSTLINK_DEPLOY_BUFFER_SIGNER=${bufferSigner}.`,
    { cause: lastError },
  );
}

async function deploy(plan) {
  const { rpc: preferredRpc, wallet, programId, artifact } = build(plan);
  // Leave room for future instruction growth only when the existing
  // ProgramData account must be extended. Reusing that headroom on every
  // upgrade needlessly increases the temporary buffer rent requirement.
  const artifactBytes = statSync(artifact).size;
  const requiredLength = Math.ceil(artifactBytes / 1024) * 1024;
  const growthHeadroom = 64 * 1024;
  const transport = (process.env.TRUSTLINK_DEPLOY_TRANSPORT ?? "rpc").toLowerCase();
  if (!["rpc", "quic"].includes(transport)) {
    throw new Error("TRUSTLINK_DEPLOY_TRANSPORT must be rpc or quic.");
  }
  const configuredSignAttempts = process.env.TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS ?? "20";
  const maxSignAttempts = Number(configuredSignAttempts);
  if (!/^\d+$/.test(configuredSignAttempts) || !Number.isSafeInteger(maxSignAttempts) || maxSignAttempts < 5) {
    throw new Error("TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS must be an integer >= 5.");
  }
  console.log(`artifact bytes: ${artifactBytes}`);
  console.log(`deploy transport: ${transport}`);
  console.log(`max sign attempts: ${maxSignAttempts}`);
  console.log("Deploying SBF artifact to Devnet...");
  const workspace = join(root, plan.workspace);
  const { rpc, env, currentShow, initialDeploy } = await inspectDeploymentRpc(plan, preferredRpc, wallet, programId);
  const buffer = ensureBufferSigner(plan, workspace);
  const bufferSigner = buffer.path;
  console.log(`buffer signer: ${bufferSigner}`);
  const currentLength = Number.parseInt(currentShow.match(/Data Length:\s*([\d,]+)/)?.[1]?.replaceAll(",", "") ?? "0", 10);
  const maxLen = currentLength >= requiredLength
    ? currentLength
    : requiredLength + growthHeadroom;
  console.log(`program data max length: ${maxLen}`);
  if (!initialDeploy && currentLength > 0 && currentLength < requiredLength) {
    const extension = maxLen - currentLength;
    console.log(`extending ProgramData by ${extension} bytes (${currentLength} -> ${maxLen})`);
    // `program extend` does not accept the transport flags used by
    // `program deploy` in older Solana CLIs. The URL already selects RPC.
    runProgram("solana", ["program", "extend", programId, String(extension), "--keypair", wallet, "--url", rpc], workspace, `Extend ${plan.label} ProgramData`, env);
  } else {
    console.log(`ProgramData capacity: ${currentLength || "unknown"}; target: ${maxLen}`);
  }
  deployWithRecovery(
    plan,
    ["program", "deploy", plan.artifactRelative, "--program-id", plan.keypair, "--keypair", wallet, "--max-len", String(maxLen), "--max-sign-attempts", String(maxSignAttempts), "--commitment", "confirmed", "--url", rpc],
    workspace,
    env,
    transport,
    bufferSigner,
  );
  console.log(`=== ${plan.label} post-deploy program show ===`);
  try {
    const postShow = await runRpcRead(["program", "show", "--url", rpc, programId], workspace, `${plan.label} post-deploy program show`, env);
    if (!/Data Length:\s*[\d,]+/.test(postShow)) throw new Error(`${plan.label} post-deploy program data could not be parsed.`);
    console.log(redactRpcCredentials(postShow));
  } catch (error) {
    throw new Error(`${plan.label} upload CLI returned success, but post-deploy verification is incomplete. ` +
      `Inspect deployed program state before any retry. Buffer signer retained at ${bufferSigner}.`, { cause: error });
  }
  if (buffer.generated) {
    runProgram("rm", ["-f", bufferSigner], workspace, `Remove ${plan.label} deploy buffer signer`);
  }
}

async function main() {
  if (!Object.hasOwn(plans, requested) && requested !== "all") {
    throw new Error("Usage: node scripts/devnet-program-deploy.mjs <build|deploy> <tsn|tcap|gpru|all>");
  }
  rpcReadAttempts();
  if (operation === "deploy") recoveryRounds();
  console.log(`TrustLink Devnet program ${operation}: ${requested}`);
  console.log("No localnet path is available or permitted.");
  const bootstrapPlan = plans[requested === "all" ? "tsn" : requested];
  const bootstrapRpc = resolveRpc(bootstrapPlan);
  const bootstrapWallet = resolveWallet(bootstrapPlan);
  const bootstrapEnv = { ANCHOR_PROVIDER_URL: bootstrapRpc, ANCHOR_WALLET: bootstrapWallet, SOLANA_WALLET: bootstrapWallet };
  runProgram("npm", ["run", "deploy:lockfiles:stabilize"], root, "Stabilize Devnet lockfiles", bootstrapEnv);
  runProgram("npm", ["run", "deploy:doctor"], root, "Run Devnet deploy doctor", bootstrapEnv);

  for (const key of requested === "all" ? ["tsn", "tcap", "gpru"] : [requested]) {
    if (operation === "build") build(plans[key]);
    else await deploy(plans[key]);
  }

  console.log(`\nDevnet ${operation} flow completed for: ` + (requested === "all" ? "TSN, TCap, GPRU" : plans[requested].label));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
