import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const [cwdArg, ...anchorArgs] = process.argv.slice(2);

if (!cwdArg || anchorArgs.length === 0) {
  console.error("Usage: node scripts/run-anchor.mjs <cwd> <anchor-args...>");
  process.exit(1);
}

const home = process.env.HOME || process.env.USERPROFILE || "";
const candidates = [
  process.env.ANCHOR_BIN,
  home ? join(home, ".avm", "bin", "anchor-0.30.1") : null,
  "anchor-0.30.1",
  "anchor",
].filter(Boolean);

let lastResult = null;

for (const candidate of candidates) {
  const command = String(candidate);
  if (command.includes("/") || command.includes("\\")) {
    if (!existsSync(command)) continue;
  }

  const result = spawnSync(command, anchorArgs, {
    cwd: cwdArg,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });

  if (result.error?.code === "ENOENT") {
    lastResult = result;
    continue;
  }

  process.exit(result.status ?? 1);
}

console.error(
  [
    "No usable Anchor binary found.",
    "Set ANCHOR_BIN to the real Anchor CLI binary, for example:",
    "  export ANCHOR_BIN=$HOME/.avm/bin/anchor-0.30.1",
    lastResult?.error ? `Last error: ${lastResult.error.message}` : "",
  ].filter(Boolean).join("\n"),
);
process.exit(1);
