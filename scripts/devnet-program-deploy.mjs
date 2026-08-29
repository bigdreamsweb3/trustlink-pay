import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";

const root = resolve(process.cwd());
const operation = ["build", "deploy"].includes(process.argv[2]) ? process.argv[2] : "deploy";
const requested = ["build", "deploy"].includes(process.argv[2]) ? (process.argv[3] ?? "all") : (process.argv[2] ?? "all");
const plans = {
  tsn: {
    label: "TSN",
    workspace: "tsn-protocol/tsn/protocol",
    anchor: "tsn-protocol/tsn/protocol/Anchor.toml",
    program: "trustlink_escrow",
    programId: "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
    artifact: "tsn-protocol/tsn/protocol/target/deploy/trustlink_escrow.so",
    artifactRelative: "target/deploy/trustlink_escrow.so",
    keypair: "target/deploy/trustlink_escrow-keypair.json",
  },
  tcap: {
    label: "TCap",
    workspace: "tcap-protocol",
    anchor: "tcap-protocol/Anchor.toml",
    program: "tcap",
    programId: "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
    artifact: "tcap-protocol/target/deploy/tcap.so",
    artifactRelative: "target/deploy/tcap.so",
    keypair: "target/deploy/tcap-keypair.json",
  },
};

if (!Object.hasOwn(plans, requested) && requested !== "all") {
  throw new Error(`Usage: node scripts/devnet-program-deploy.mjs <tsn|tcap|all>`);
}

function run(command, args, options = {}) {
  console.log(`$ ${command} ${displayArgs(args).join(" ")}`);
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    timeout: options.timeout ?? 1_800_000,
  }).trim();
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function toWslPath(value) {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(value);
  if (!match) return value.replaceAll("\\", "/");
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

function displayArgs(args) {
  return args.map((arg) => String(arg).replace(/([?&](?:api-key|key|token)=)[^&\s]+/gi, "$1<redacted>"));
}

function useWslForPrograms() {
  return process.platform === "win32" && process.env.TSN_NATIVE_SOLANA_TOOLS !== "1";
}

function runProgram(command, args, cwd, label, env = {}, capture = false) {
  const mergedEnv = { ...process.env, ...env };
  if (!useWslForPrograms()) {
    console.log(`\n[devnet] ${label}`);
    console.log(`[devnet] $ ${command} ${displayArgs(args).join(" ")}`);
    const result = spawnSync(command, args, { cwd, env: mergedEnv, encoding: capture ? "utf8" : undefined, stdio: capture ? "pipe" : "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
    return capture ? result.stdout.trim() : "";
  }

  const assignments = Object.entries(env)
    .filter(([key]) => ["ANCHOR_PROVIDER_URL", "ANCHOR_WALLET", "SOLANA_WALLET"].includes(key))
    .map(([key, value]) => `export ${key}=${shellQuote(key.includes("WALLET") ? toWslPath(value) : value)}`)
    .join(" && ");
  const unixCwd = toWslPath(cwd);
  const unixCommand = [command, ...args].map(shellQuote).join(" ");
  const script = `${assignments ? `${assignments} && ` : ""}cd ${shellQuote(unixCwd)} && ${unixCommand}`;
  console.log(`\n[devnet] ${label}`);
  const loggedScript = process.env.ANCHOR_PROVIDER_URL
    ? script.replaceAll(process.env.ANCHOR_PROVIDER_URL, "<rpc-redacted>")
    : script;
  console.log(`[devnet] wsl.exe bash -lc ${shellQuote(loggedScript)}`);
  const result = spawnSync("wsl.exe", ["bash", "-lc", script], { encoding: capture ? "utf8" : undefined, env: process.env, stdio: capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  return capture ? result.stdout.trim() : "";
}

function readAnchorConfig(relativePath) {
  const body = readFileSync(join(root, relativePath), "utf8");
  const cluster = body.match(/^cluster\s*=\s*"([^"]+)"/m)?.[1];
  const wallet = body.match(/^wallet\s*=\s*"([^"]+)"/m)?.[1];
  return { cluster, wallet };
}

function resolveRpc(plan) {
  return process.env.ANCHOR_PROVIDER_URL
    ?? process.env.SOLANA_RPC_URL
    ?? readAnchorConfig(plan.anchor).cluster
    ?? (() => { throw new Error("No Devnet RPC found. Set ANCHOR_PROVIDER_URL or use the workspace Anchor.toml cluster."); })();
}

function safeRpc(rpc) {
  try {
    const url = new URL(rpc);
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search ? "?api-key=<redacted>" : ""}`;
  } catch {
    return "<unparseable-rpc>";
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
  if (output !== plan.programId) {
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
  console.log(`program id: ${plan.programId}`);
  console.log(`build: anchor build --no-idl`);
  console.log("note: IDL generation skipped due to host toolchain compatibility; deploying SBF artifact only.");
}

function build(plan) {
  const rpc = resolveRpc(plan);
  const wallet = resolveWallet(plan);
  printPlan(plan, rpc, wallet);
  runProgram("anchor", ["build", "--no-idl"], join(root, plan.workspace), `Build ${plan.label} program with --no-idl`, { ANCHOR_PROVIDER_URL: rpc, ANCHOR_WALLET: wallet, SOLANA_WALLET: wallet });
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
  const rounds = Number.parseInt(process.env.TRUSTLINK_DEPLOY_RECOVERY_ROUNDS ?? "3", 10);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 5) {
    throw new Error("TRUSTLINK_DEPLOY_RECOVERY_ROUNDS must be an integer from 1 to 5.");
  }

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
    `The existing program was not replaced. Resume with TRUSTLINK_DEPLOY_BUFFER_SIGNER=${bufferSigner}.`,
    { cause: lastError },
  );
}

function deploy(plan) {
  const { rpc, wallet, programId, artifact } = build(plan);
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
  const maxSignAttempts = Number.parseInt(process.env.TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS ?? "20", 10);
  if (!Number.isInteger(maxSignAttempts) || maxSignAttempts < 5) {
    throw new Error("TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS must be an integer >= 5.");
  }
  console.log(`artifact bytes: ${artifactBytes}`);
  console.log(`deploy transport: ${transport}`);
  console.log(`max sign attempts: ${maxSignAttempts}`);
  console.log("Deploying SBF artifact to Devnet...");
  const workspace = join(root, plan.workspace);
  const buffer = ensureBufferSigner(plan, workspace);
  const bufferSigner = buffer.path;
  console.log(`buffer signer: ${bufferSigner}`);
  const currentShow = runProgram("solana", ["program", "show", "--url", rpc, programId], workspace, `Inspect ${plan.label} ProgramData capacity`, { ANCHOR_PROVIDER_URL: rpc, ANCHOR_WALLET: wallet, SOLANA_WALLET: wallet }, true);
  const currentLength = Number.parseInt(currentShow.match(/Data Length:\s*([\d,]+)/)?.[1]?.replaceAll(",", "") ?? "0", 10);
  const maxLen = currentLength >= requiredLength
    ? requiredLength
    : requiredLength + growthHeadroom;
  console.log(`program data max length: ${maxLen}`);
  if (currentLength > 0 && currentLength < requiredLength) {
    const extension = maxLen - currentLength;
    console.log(`extending ProgramData by ${extension} bytes (${currentLength} -> ${maxLen})`);
    // `program extend` does not accept the transport flags used by
    // `program deploy` in older Solana CLIs. The URL already selects RPC.
    runProgram("solana", ["program", "extend", programId, String(extension), "--keypair", wallet, "--url", rpc], workspace, `Extend ${plan.label} ProgramData`, { ANCHOR_PROVIDER_URL: rpc, ANCHOR_WALLET: wallet, SOLANA_WALLET: wallet });
  } else {
    console.log(`ProgramData capacity: ${currentLength || "unknown"}; target: ${maxLen}`);
  }
  deployWithRecovery(
    plan,
    ["program", "deploy", plan.artifactRelative, "--program-id", plan.keypair, "--keypair", wallet, "--max-len", String(maxLen), "--max-sign-attempts", String(maxSignAttempts), "--commitment", "confirmed", "--url", rpc],
    workspace,
    { ANCHOR_PROVIDER_URL: rpc, ANCHOR_WALLET: wallet, SOLANA_WALLET: wallet },
    transport,
    bufferSigner,
  );
  if (buffer.generated) {
    runProgram("rm", ["-f", bufferSigner], workspace, `Remove ${plan.label} deploy buffer signer`);
  }
  console.log(`=== ${plan.label} post-deploy program show ===`);
  runProgram("solana", ["program", "show", "--url", rpc, programId], join(root, plan.workspace), `${plan.label} post-deploy program show`, { ANCHOR_PROVIDER_URL: rpc, ANCHOR_WALLET: wallet, SOLANA_WALLET: wallet });
}

console.log(`TrustLink Devnet program ${operation}: ${requested}`);
console.log("No localnet path is available or permitted.");
const bootstrapPlan = plans[requested === "all" ? "tsn" : requested];
const bootstrapRpc = resolveRpc(bootstrapPlan);
const bootstrapWallet = resolveWallet(bootstrapPlan);
const bootstrapEnv = { ANCHOR_PROVIDER_URL: bootstrapRpc, ANCHOR_WALLET: bootstrapWallet, SOLANA_WALLET: bootstrapWallet };
runProgram("npm", ["run", "deploy:lockfiles:stabilize"], root, "Stabilize Devnet lockfiles", bootstrapEnv);
runProgram("npm", ["run", "deploy:doctor"], root, "Run Devnet deploy doctor", bootstrapEnv);

for (const key of requested === "all" ? ["tsn", "tcap"] : [requested]) {
  if (operation === "build") build(plans[key]);
  else deploy(plans[key]);
}

console.log(`\nDevnet ${operation} flow completed for: ` + (requested === "all" ? "TSN, TCap" : plans[requested].label));
