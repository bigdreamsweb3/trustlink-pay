import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(process.cwd());
const target = resolve(root, process.env.TSN_DOCS_DIR ?? "tsn-protocol/tsn-docs");
const repository = "https://github.com/bigdreamsweb3/tsn-docs.git";
const branch = process.env.TSN_DOCS_BRANCH ?? "main";

function git(args, cwd = root) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "inherit" });
}

if (!existsSync(target)) {
  git(["clone", "--branch", branch, repository, target]);
} else {
  const gitPath = join(target, ".git");
  if (!existsSync(gitPath) || !statSync(gitPath).isDirectory()) {
    throw new Error(`${target} exists but is not a standalone Git checkout; refusing to overwrite it.`);
  }

  const origin = execFileSync("git", ["config", "--get", "remote.origin.url"], { cwd: target, encoding: "utf8" }).trim();
  if (origin !== repository) {
    throw new Error(`Unexpected TSN docs remote: ${origin}`);
  }

  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: target, encoding: "utf8" }).trim();
  if (dirty) {
    throw new Error(`${target} has local changes; commit or stash them before pulling.`);
  }

  git(["fetch", "origin", branch, "--prune"], target);
  git(["checkout", branch], target);
  git(["pull", "--ff-only", "origin", branch], target);
}

const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: target, encoding: "utf8" }).trim();
console.log(`TSN docs are up to date at ${commit}: ${target}`);