import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const requiredSolanaMajorMinor = "1.18";
const pinnedProgramCrate = "1.18.26";
const requiredAnchor = "0.30.1";
const warnings = [];

function run(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 20000,
    }).trim();
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    const stdout = error.stdout?.toString().trim();
    throw new Error(
      `${command} ${args.join(" ")} failed${stderr || stdout ? `:\n${stderr || stdout}` : ""}`,
    );
  }
}

function resolveAnchorCommand() {
  const candidates = [
    process.env.ANCHOR_BIN,
    process.env.HOME ? join(process.env.HOME, ".avm", "bin", "anchor-0.30.1") : null,
    "anchor-0.30.1",
    "anchor",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const command = String(candidate);
    if ((command.includes("/") || command.includes("\\")) && !existsSync(command)) {
      continue;
    }

    try {
      return {
        command,
        version: run(command, ["--version"]),
      };
    } catch {
      continue;
    }
  }

  throw new Error(
    [
      "anchor --version failed and no pinned anchor-0.30.1 binary was usable.",
      "If AVM is installed, set ANCHOR_BIN to the real binary:",
      "  export ANCHOR_BIN=$HOME/.avm/bin/anchor-0.30.1",
    ].join("\n"),
  );
}

function parseVersion(label, output, pattern) {
  const match = output.match(pattern);
  const version = match?.slice(1).find(Boolean);
  if (!version) {
    throw new Error(`${label} version could not be parsed from: ${output}`);
  }
  return version;
}

function requireExactVersion(label, output, pattern, expected) {
  const version = parseVersion(label, output, pattern);
  if (version !== expected) {
    throw new Error(
      `${label} must be ${expected} for devnet deploy builds, but found ${version}.\n` +
        `Output: ${output}`,
    );
  }
}

function requireSolana18Version(label, output, pattern) {
  const version = parseVersion(label, output, pattern);
  if (!version.startsWith(`${requiredSolanaMajorMinor}.`)) {
    throw new Error(
      `${label} must be Solana/SBF ${requiredSolanaMajorMinor}.x for devnet deploy builds, but found ${version}.\n` +
        "Solana/SBF 3.x and standalone cargo-build-sbf 4.x can emit unsupported sBPF bytecode.\n" +
        `Output: ${output}`,
    );
  }
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
}

function warnIfHostCargoCanRewriteLockfile(cargoOutput) {
  const version = parseVersion("cargo", cargoOutput, /cargo\s+(\d+\.\d+\.\d+)/);
  if (compareVersions(version, "1.78.0") >= 0) {
    warnings.push(
      `host cargo is ${version}; avoid regenerating Solana deploy lockfiles with host cargo because it can write Cargo.lock v4. ` +
        "If a lockfile changes, run npm run deploy:lockfiles:stabilize before deploying.",
    );
  }
}

function getCargoLockVersion(body) {
  const match = body.match(/^version = (\d+)$/m);
  return match?.[1] ?? null;
}

function parseCargoLockPackages(body) {
  const packages = new Map();
  const blocks = body.split(/\r?\n\[\[package\]\]\r?\n/).slice(1);

  for (const block of blocks) {
    const name = block.match(/^name = "([^"]+)"/m)?.[1];
    const version = block.match(/^version = "([^"]+)"/m)?.[1];
    if (name && version) {
      if (!packages.has(name)) packages.set(name, []);
      packages.get(name).push(version);
    }
  }

  return packages;
}

function packageVersions(packages, name) {
  return packages.get(name) ?? [];
}

function hasPackageVersion(packages, name, predicate) {
  return packageVersions(packages, name).some(predicate);
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

const solanaVersion = run("solana", ["--version"]);
let sbfVersion;
try {
  sbfVersion = execFileSync("cargo-build-sbf", ["--version"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20000,
  }).trim();
} catch {
  sbfVersion = run("cargo", ["build-sbf", "--version"]);
}
const anchor = resolveAnchorCommand();
const anchorVersion = anchor.version;
const cargoVersion = run("cargo", ["--version"]);
const rustcVersion = run("rustc", ["--version"]);

requireSolana18Version("solana-cli", solanaVersion, /solana-cli\s+(\d+\.\d+\.\d+)/);
requireSolana18Version(
  "cargo build-sbf",
  sbfVersion,
  /(?:solana-)?cargo-build-sbf\s+(\d+\.\d+\.\d+)|cargo-build-sbf\s+(\d+\.\d+\.\d+)/,
);
requireExactVersion("anchor-cli", anchorVersion, /anchor-cli\s+(\d+\.\d+\.\d+)/, requiredAnchor);
warnIfHostCargoCanRewriteLockfile(cargoVersion);

const tsnAnchorPath = "tsn-protocol/tsn/protocol/Anchor.toml";
const tinsAnchorPath = "tin-system/tins-registrar/program/Anchor.toml";
const tinsCargoPath = "tin-system/tins-registrar/program/Cargo.toml";
const tsnLockPath = "tsn-protocol/tsn/protocol/Cargo.lock";
const tinsLockPath = "tin-system/tins-registrar/program/Cargo.lock";

const tsnAnchor = read(tsnAnchorPath);
const tinsAnchor = read(tinsAnchorPath);
const tinsCargo = read(tinsCargoPath);
const tsnLock = read(tsnLockPath);
const tinsLock = read(tinsLockPath);

const requiredSnippets = [
  [tsnAnchorPath, tsnAnchor, `anchor_version = "${requiredAnchor}"`],
  [tinsAnchorPath, tinsAnchor, `anchor_version = "${requiredAnchor}"`],
  [tinsCargoPath, tinsCargo, `solana-program = "=${pinnedProgramCrate}"`],
];

for (const [path, body, snippet] of requiredSnippets) {
  if (!body.includes(snippet)) {
    throw new Error(`${path} is missing required deploy pin: ${snippet}`);
  }
}

const forbiddenSnippets = [
  [tsnAnchorPath, tsnAnchor, "solana_version"],
  [tinsAnchorPath, tinsAnchor, "solana_version"],
];

for (const [path, body, snippet] of forbiddenSnippets) {
  if (body.includes(snippet)) {
    throw new Error(
      `${path} must not set ${snippet}.\n` +
        "Anchor can try to auto-install Solana through solana-install when this is set. " +
        "TrustLink Pay uses deploy:doctor to verify the active Solana/SBF toolchain instead.",
    );
  }
}

const lockfiles = [
  [tsnLockPath, tsnLock],
  [tinsLockPath, tinsLock],
];

for (const [path, body] of lockfiles) {
  const lockVersion = getCargoLockVersion(body);
  if (lockVersion !== "3") {
    throw new Error(
      `${path} uses Cargo.lock format version ${lockVersion ?? "unknown"}, but Solana/SBF 1.18.x Cargo needs version 3.\n` +
        "Run npm run deploy:lockfiles:stabilize before deploying.",
    );
  }

  const packages = parseCargoLockPackages(body);
  const blake3Versions = packageVersions(packages, "blake3");

  if (hasPackageVersion(packages, "blake3", (version) => version.startsWith("1.8."))) {
    throw new Error(
      `${path} uses blake3 ${blake3Versions.join(", ")}, which currently pulls Rust edition 2024 crates.\n` +
        "Solana/SBF 1.18.x uses Cargo 1.75 and cannot parse those manifests. Pin blake3 to 1.5.5, then run npm run deploy:lockfiles:stabilize.",
    );
  }

  if (hasPackageVersion(packages, "indexmap", (version) => compareVersions(version, "2.3.0") > 0)) {
    throw new Error(
      `${path} uses indexmap ${packageVersions(packages, "indexmap").join(", ")}, but Solana/SBF 1.18.x cannot build newer indexmap crates that require newer Rust/edition support.\n` +
        "Run inside this lockfile's program directory: cargo update -p indexmap --precise 2.3.0",
    );
  }

  if (hasPackageVersion(packages, "borsh", (version) => compareVersions(version, "1.5.7") > 0)) {
    throw new Error(
      `${path} uses borsh ${packageVersions(packages, "borsh").join(", ")}, which requires Rust 1.77+ and breaks Solana/SBF 1.18.x deploy builds.\n` +
        "Run inside this lockfile's program directory: cargo update -p borsh --precise 1.5.7",
    );
  }

  if (hasPackageVersion(packages, "zeroize_derive", (version) => version === "1.5.0")) {
    throw new Error(
      `${path} uses zeroize_derive 1.5.0, which requires Rust edition 2024.\n` +
        "Solana/SBF 1.18.x uses Cargo 1.75. Pin zeroize_derive to 1.4.3, then run npm run deploy:lockfiles:stabilize.",
    );
  }

  if (hasPackageVersion(packages, "proc-macro-crate", (version) => version === "3.5.0")) {
    throw new Error(
      `${path} uses proc-macro-crate 3.5.0, which resolves to toml_edit 0.25.x and toml_parser 1.1.x.\n` +
        "That TOML parser chain requires Rust edition 2024. Pin proc-macro-crate to 3.3.0, then run npm run deploy:lockfiles:stabilize.",
    );
  }

  if (hasPackageVersion(packages, "toml_parser", (version) => version.startsWith("1."))) {
    throw new Error(
      `${path} uses toml_parser 1.x, which requires Rust edition 2024.\n` +
        "Pin proc-macro-crate to 3.3.0 so Cargo resolves toml_edit 0.22.x without toml_parser.",
    );
  }

  if (hasPackageVersion(packages, "toml_edit", (version) => version.startsWith("0.25."))) {
    throw new Error(
      `${path} uses toml_edit 0.25.x, which pulls toml_parser 1.x and requires Rust edition 2024.\n` +
        "Pin proc-macro-crate to 3.3.0 so Cargo resolves toml_edit 0.22.x.",
    );
  }
}

console.log("Solana deploy doctor passed.");
console.log(`- ${solanaVersion}`);
console.log(`- ${sbfVersion.split("\n")[0]}`);
console.log(`- ${anchorVersion} (${anchor.command})`);
console.log(`- ${cargoVersion}`);
console.log(`- ${rustcVersion}`);

if (warnings.length > 0) {
  console.log("\nWarnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}
