import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const args = process.argv.slice(2);

function optionValue(name, fallback) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }

  return fallback;
}

const options = {
  buildApps: args.includes("--build-apps"),
  buildOnly: args.includes("--build-only"),
  dryRun: args.includes("--dry-run"),
  includeTins: !args.includes("--skip-tins"),
  runChecks: !args.includes("--skip-checks"),
  url: optionValue(
    "--url",
    process.env.TSN_DEPLOY_URL ||
      process.env.ANCHOR_PROVIDER_URL ||
      "devnet",
  ),
};

if (args.includes("--help")) {
  console.log(`
Usage:
  npm run rebuild:redeploy:all
  npm run rebuild:redeploy:all -- --url devnet

Options:
  --url <cluster>  Solana cluster name or RPC URL (default: devnet)
  --build-only     Build and validate without deploying programs
  --build-apps     Also run production builds for frontend/backend/mempool UI
  --skip-checks    Skip application TypeScript checks
  --skip-tins      Skip the TINS program and TINS SDK
  --dry-run        Print the commands without executing them

On Windows, Solana/Anchor commands run inside WSL while npm commands run
natively. Set TSN_NATIVE_SOLANA_TOOLS=1 to use Windows Solana tools instead.
`);
  process.exit(0);
}

  const programs = {
  tsn: {
    build: ["anchor", ["build"]],
    cwd: path.join(root, "tsn-protocol", "tsn", "protocol"),
    deployKeypair: path.join(
      root,
      "tsn-protocol",
      "tsn",
      "protocol",
      "target",
      "deploy",
      "trustlink_escrow-keypair.json",
    ),
    expectedId: "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
    keypair: path.join(
      root,
      "tsn-protocol",
      "tsn",
      "protocol",
      "pids",
      "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V.json",
    ),
    relativeArtifact: "target/deploy/trustlink_escrow.so",
    relativeKeypair:
      "pids/TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V.json",
  },
  tins: {
    build: ["anchor", ["build"]],
    cwd: path.join(root, "tin-system", "tins-registrar", "program"),
    deployKeypair: path.join(
      root,
      "tin-system",
      "tins-registrar",
      "program",
      "target",
      "deploy",
      "tins_program-keypair.json",
    ),
    expectedId: "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT",
    keypair: path.join(
      root,
      "tin-system",
      "tins-registrar",
      "program",
      "pids",
      "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT.json",
    ),
    relativeArtifact: "target/deploy/tins_program.so",
    relativeKeypair:
      "pids/TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT.json",
  },
};

function quote(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function toWslPath(value) {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(value);
  if (!match) return value.replaceAll("\\", "/");
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

function commandText(command, commandArgs) {
  return [command, ...commandArgs].map(quote).join(" ");
}

function fail(message) {
  throw new Error(message);
}

function run(command, commandArgs, cwd, label) {
  console.log(`\n[release] ${label}`);
  console.log(`[release] ${commandText(command, commandArgs)}`);
  if (options.dryRun) return;

  const result = spawnSync(command, commandArgs, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function useWslForPrograms() {
  return (
    process.platform === "win32" &&
    process.env.TSN_NATIVE_SOLANA_TOOLS !== "1"
  );
}

function runProgramCommand(command, commandArgs, cwd, label, capture = false) {
  if (!useWslForPrograms()) {
    if (!capture) {
      run(command, commandArgs, cwd, label);
      return "";
    }

    const result = spawnSync(command, commandArgs, {
      cwd,
      encoding: "utf8",
      env: process.env,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.stderr.write(result.stderr || "");
      fail(`${label} failed with exit code ${result.status ?? "unknown"}.`);
    }
    return result.stdout.trim();
  }

  const unixCommand = [command, ...commandArgs].map(shellQuote).join(" ");
  const script = `cd ${shellQuote(toWslPath(cwd))} && ${unixCommand}`;

  console.log(`\n[release] ${label}`);
  console.log(`[release] wsl bash -lc ${quote(script)}`);
  if (options.dryRun) return "";

  const result = spawnSync("wsl.exe", ["bash", "-lc", script], {
    encoding: capture ? "utf8" : undefined,
    env: process.env,
    stdio: capture ? "pipe" : "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    fail(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
  return capture ? result.stdout.trim() : "";
}

function runNpm(commandArgs, cwd, label) {
  run(npmCommand, commandArgs, cwd, label);
}

function assertFile(file, label) {
  if (!existsSync(file)) fail(`${label} not found: ${file}`);
}

function prepareProgram(program, name) {
  assertFile(program.keypair, `${name} fixed program keypair`);

  const actualId = runProgramCommand(
    "solana-keygen",
    ["pubkey", program.relativeKeypair],
    program.cwd,
    `Verify ${name} program ID`,
    true,
  );

  if (!options.dryRun && actualId !== program.expectedId) {
    fail(
      `${name} keypair resolves to ${actualId}, expected ${program.expectedId}.`,
    );
  }

  console.log(`[release] ${name} program ID: ${program.expectedId}`);
  if (options.dryRun) return;

  mkdirSync(path.dirname(program.deployKeypair), { recursive: true });
  copyFileSync(program.keypair, program.deployKeypair);
}

function buildProgram(program, name) {
  const [command, commandArgs] = program.build;
  runProgramCommand(command, commandArgs, program.cwd, `Build ${name} program`);
  if (!options.dryRun) {
    assertFile(
      path.join(program.cwd, program.relativeArtifact),
      `${name} deploy artifact`,
    );
    copyFileSync(program.keypair, program.deployKeypair);
  }
}

function deployProgram(program, name) {
  runProgramCommand(
    "solana",
    [
      "program",
      "deploy",
      program.relativeArtifact,
      "--program-id",
      program.relativeKeypair,
      "--url",
      options.url,
    ],
    program.cwd,
    `Deploy ${name} program to ${options.url}`,
  );
}

function cleanCaches() {
  const caches = [
    path.join(root, "frontend", ".next"),
    path.join(root, "backend", ".next"),
    path.join(root, "tsn-protocol", "tsn-mempool-frontend", ".next"),
  ];

  for (const cache of caches) {
    console.log(`[release] Clear ${path.relative(root, cache)}`);
    if (!options.dryRun) rmSync(cache, { recursive: true, force: true });
  }
}

function installAndBuildSdk(directory, name) {
  const cwd = path.join(root, directory);
  runNpm(["install", "--no-audit", "--no-fund"], cwd, `Install ${name}`);
  runNpm(["run", "build"], cwd, `Build ${name}`);
}

function installConsumers() {
  const consumers = [
    ["frontend", "frontend"],
    ["backend", "backend"],
    ["tsn-protocol/tsn", "TSN tools"],
    ["tsn-protocol/tsn-cranker-op-daemon", "Cranker daemon"],
    ["tsn-protocol/tsn-mempool-frontend", "mempool UI"],
  ];

  for (const [directory, name] of consumers) {
    runNpm(
      ["install", "--no-audit", "--no-fund"],
      path.join(root, directory),
      `Refresh SDK links in ${name}`,
    );
  }
}

function runTypeChecks() {
  runNpm(
    ["run", "typecheck"],
    path.join(root, "backend"),
    "Type-check backend",
  );
  runNpm(
    ["run", "typecheck"],
    path.join(root, "frontend"),
    "Type-check frontend",
  );
  runNpm(
    ["run", "typecheck"],
    path.join(root, "tsn-protocol", "tsn-mempool-frontend"),
    "Type-check mempool UI",
  );

  const tsc = path.join(
    root,
    "tsn-cranker-sdk",
    "node_modules",
    "typescript",
    "bin",
    "tsc",
  );
  run(
    process.execPath,
    [
      tsc,
      "--noEmit",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--types",
      "node",
      "--allowImportingTsExtensions",
      "--skipLibCheck",
      "scripts/cranker.ts",
    ],
    path.join(root, "tsn-protocol", "tsn-cranker-op-daemon"),
    "Type-check Cranker daemon",
  );
}

function buildApps() {
  for (const [directory, name] of [
    ["backend", "backend"],
    ["frontend", "frontend"],
    ["tsn-protocol/tsn-mempool-frontend", "mempool UI"],
  ]) {
    runNpm(
      ["run", "build"],
      path.join(root, directory),
      `Build ${name}`,
    );
  }
}

async function main() {
  console.log("[release] TrustLink protocol rebuild and redeploy");
  console.log(`[release] Cluster: ${options.url}`);

  prepareProgram(programs.tsn, "TSN");
  if (options.includeTins) prepareProgram(programs.tins, "TINS");

  buildProgram(programs.tsn, "TSN");
  if (options.includeTins) buildProgram(programs.tins, "TINS");

  if (options.includeTins) {
    installAndBuildSdk("tins-sdk", "TINS SDK");
  }
  installAndBuildSdk("tsn-sdk", "TSN SDK");
  installAndBuildSdk("tsn-cranker-sdk", "TSN Cranker SDK");
  installConsumers();
  cleanCaches();

  if (options.runChecks) runTypeChecks();
  if (options.buildApps) buildApps();

  if (!options.buildOnly) {
    deployProgram(programs.tsn, "TSN");
    if (options.includeTins) deployProgram(programs.tins, "TINS");
  }

  console.log("\n[release] Complete.");
  if (options.buildOnly) {
    console.log("[release] Programs were built but not deployed.");
  } else {
    console.log(`[release] Programs deployed to ${options.url}.`);
  }
  console.log("[release] Restart local servers and the Cranker daemon.");
}

main().catch((error) => {
  console.error(`\n[release] ${error.message}`);
  process.exit(1);
});
