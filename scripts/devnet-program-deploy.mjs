import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
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

function deploy(plan) {
  const { rpc, wallet, programId, artifact } = build(plan);
  // Leave room for future instruction growth when upgrading an existing
  // ProgramData account. Without an explicit max length, the loader can
  // reject a larger replacement artifact with "account data too small".
  const artifactBytes = statSync(artifact).size;
  const maxLen = Math.ceil(artifactBytes / 1024) * 1024 + 64 * 1024;
  const transport = (process.env.TRUSTLINK_DEPLOY_TRANSPORT ?? "rpc").toLowerCase();
  if (!["rpc", "quic"].includes(transport)) {
    throw new Error("TRUSTLINK_DEPLOY_TRANSPORT must be rpc or quic.");
  }
  const maxSignAttempts = Number.parseInt(process.env.TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS ?? "20", 10);
  if (!Number.isInteger(maxSignAttempts) || maxSignAttempts < 5) {
    throw new Error("TRUSTLINK_DEPLOY_MAX_SIGN_ATTEMPTS must be an integer >= 5.");
  }
  console.log(`artifact bytes: ${artifactBytes}`);
  console.log(`program data max length: ${maxLen}`);
  console.log(`deploy transport: ${transport}`);
  console.log(`max sign attempts: ${maxSignAttempts}`);
  console.log("Deploying SBF artifact to Devnet...");
  const transportFlag = transport === "quic" ? "--use-quic" : "--use-rpc";
  const bufferSigner = process.env.TRUSTLINK_DEPLOY_BUFFER_SIGNER;
  const bufferArgs = bufferSigner ? ["--buffer", bufferSigner] : [];
  if (bufferSigner) console.log(`buffer signer: ${bufferSigner}`);
  const currentShow = runProgram("solana", ["program", "show", "--url", rpc, programId], join(root, plan.workspace), `Inspect ${plan.label} ProgramData capacity`, { ANCHOR_PROVIDER_URL: rpc, ANCHOR_WALLET: wallet, SOLANA_WALLET: wallet }, true);
  const currentLength = Number.parseInt(currentShow.match(/Data Length:\s*([\d,]+)/)?.[1]?.replaceAll(",", "") ?? "0", 10);
  const requiredLength = Math.ceil(artifactBytes / 1024) * 1024;
  if (currentLength > 0 && currentLength < requiredLength) {
    const extension = maxLen - currentLength;
    console.log(`extending ProgramData by ${extension} bytes (${currentLength} -> ${maxLen})`);
    runProgram("solana", ["program", "extend", programId, String(extension), "--keypair", wallet, transportFlag, "--url", rpc], join(root, plan.workspace), `Extend ${plan.label} ProgramData`, { ANCHOR_PROVIDER_URL: rpc, ANCHOR_WALLET: wallet, SOLANA_WALLET: wallet });
  } else {
    console.log(`ProgramData capacity: ${currentLength || "unknown"}; target: ${maxLen}`);
  }
  runProgram("solana", ["program", "deploy", plan.artifactRelative, "--program-id", plan.keypair, "--keypair", wallet, "--max-len", String(maxLen), "--max-sign-attempts", String(maxSignAttempts), ...bufferArgs, transportFlag, "--commitment", "confirmed", "--url", rpc], join(root, plan.workspace), `Deploy ${plan.label} SBF artifact to Devnet`, { ANCHOR_PROVIDER_URL: rpc, ANCHOR_WALLET: wallet, SOLANA_WALLET: wallet });
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
