import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const lockfiles = [
  "tsn-protocol/tsn/protocol/Cargo.lock",
  "transfer-identity-protocol/tin-registrar/program/Cargo.lock",
  "ZK-PRU/programs/zk-pru-registry/Cargo.lock",
  "tcap-protocol/Cargo.lock",
];
const requiredPins = [
  ["blake3", "1.5.5", "cargo update -p blake3 --precise 1.5.5"],
  ["indexmap", "2.3.0", "cargo update -p indexmap --precise 2.3.0"],
  ["borsh", "1.5.7", "cargo update -p borsh --precise 1.5.7"],
  ["unicode-segmentation", "1.12.0", "cargo update -p unicode-segmentation --precise 1.12.0"],
  ["zeroize_derive", "1.4.3", "cargo update -p zeroize_derive --precise 1.4.3"],
  ["proc-macro-crate", "3.3.0", "cargo update -p proc-macro-crate@3.5.0 --precise 3.3.0"],
];

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

function stabilizeLockfile(path) {
  const absolutePath = join(root, path);
  let body = readFileSync(absolutePath, "utf8");
  const original = body;
  const packages = parseCargoLockPackages(body);
  const errors = [];

  body = body.replace(/^version = 4$/m, "version = 3");

  for (const [name, requiredVersion, command] of requiredPins) {
    const versions = packageVersions(packages, name);
    if (versions.length === 0) continue;

    if (name === "proc-macro-crate") {
      const modernVersions = versions.filter((version) => version.startsWith("3."));
      if (modernVersions.length > 0 && !modernVersions.includes(requiredVersion)) {
        errors.push(
          `${path} has ${name} ${modernVersions.join(", ")}; expected ${requiredVersion}. Run inside this lockfile's program directory: ${command}`,
        );
      }
      continue;
    }

    if (!versions.includes(requiredVersion)) {
      errors.push(
        `${path} has ${name} ${versions.join(", ")}; expected ${requiredVersion}. Run inside this lockfile's program directory: ${command}`,
      );
    }
  }

  if (path === "tcap-protocol/Cargo.lock") {
    const rayonVersions = packageVersions(packages, "rayon");
    if (rayonVersions.some((version) => compareVersions(version, "1.10.0") > 0)) {
      errors.push(
        `${path} has rayon ${rayonVersions.join(", ")}; expected 1.10.0. Run inside this lockfile's program directory: cargo update -p rayon --precise 1.10.0`,
      );
    }
    const procMacro2Versions = packageVersions(packages, "proc-macro2");
    if (procMacro2Versions.some((version) => compareVersions(version, "1.0.94") > 0)) {
      errors.push(
        `${path} has proc-macro2 ${procMacro2Versions.join(", ")}; expected 1.0.94. Run inside this lockfile's program directory: cargo update -p proc-macro2 --precise 1.0.94`,
      );
    }
  }

  if (packageVersions(packages, "toml_parser").some((version) => version.startsWith("1."))) {
    errors.push(
      `${path} has toml_parser 1.x, which requires Rust edition 2024. Run inside this lockfile's program directory: cargo update -p proc-macro-crate@3.5.0 --precise 3.3.0`,
    );
  }

  if (packageVersions(packages, "unicode-segmentation").some((version) => compareVersions(version, "1.12.0") > 0)) {
    errors.push(
      `${path} has unicode-segmentation ${packageVersions(packages, "unicode-segmentation").join(", ")}, which is too new for the Solana/SBF 1.18.x Rust 1.75 toolchain. Run inside this lockfile's program directory: cargo update -p unicode-segmentation --precise 1.12.0`,
    );
  }

  if (packageVersions(packages, "toml_edit").some((version) => version.startsWith("0.25."))) {
    errors.push(
      `${path} has toml_edit 0.25.x, which pulls toml_parser 1.x. Run inside this lockfile's program directory: cargo update -p proc-macro-crate@3.5.0 --precise 3.3.0`,
    );
  }

  if (packageVersions(packages, "borsh").some((version) => compareVersions(version, "1.5.7") > 0)) {
    errors.push(
      `${path} has borsh ${packageVersions(packages, "borsh").join(", ")}, which requires a newer Rust toolchain than Solana/SBF 1.18.x provides. Run inside this lockfile's program directory: cargo update -p borsh --precise 1.5.7`,
    );
  }

  if (packageVersions(packages, "jobserver").some((version) => compareVersions(version, "0.1.34") > 0)) {
    errors.push(
      `${path} has jobserver ${packageVersions(packages, "jobserver").join(", ")}, which is too new for the Solana/SBF 1.18.x Rust 1.75 toolchain. Run inside this lockfile's program directory: cargo update -p jobserver@0.1.35 --precise 0.1.32`,
    );
  }

  if (errors.length > 0) {
    // Persist only the Cargo format downgrade before reporting dependency pins.
    // Cargo 1.75 cannot parse v4, so the precise updates below would otherwise
    // be impossible to run. No dependency resolution is performed here.
    if (body !== original) {
      writeFileSync(absolutePath, body);
      console.log(`Downgraded ${path}: Cargo.lock format v4 -> v3 (dependency pins still required)`);
    }
    throw new Error(errors.join("\n"));
  }

  if (body !== original) {
    writeFileSync(absolutePath, body);
    console.log(`Stabilized ${path}: Cargo.lock format v4 -> v3`);
  } else {
    console.log(`Stable ${path}`);
  }
}

for (const lockfile of lockfiles) {
  if (!existsSync(join(root, lockfile))) {
    console.log(`Skipped missing ${lockfile}`);
    continue;
  }
  stabilizeLockfile(lockfile);
}
