#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const NEW_ID = process.argv[2];
const EXTRA_OLD_IDS = process.argv.slice(3);

if (!NEW_ID) {
  console.error(
    "Usage: node ./update-program-id.mjs <NEW_PROGRAM_ID> [OLD_ID_1 OLD_ID_2 ...]",
  );
  process.exit(1);
}

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
if (!BASE58_RE.test(NEW_ID)) {
  console.error(`Invalid Solana program id: ${NEW_ID}`);
  process.exit(1);
}

const repoRoot = process.cwd();
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "target",
  "dist",
  "build",
  ".turbo",
]);

// Keep this conservative: never replace the TSN program id while updating TIP.
// Pass previous TIP ids explicitly as extra arguments when rotating the TIP id.
const oldIds = new Set([...EXTRA_OLD_IDS]);
oldIds.delete(NEW_ID);

const textFileExts = new Set([
  ".toml",
  ".rs",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".md",
  ".env",
  ".yml",
  ".yaml",
]);

function shouldScan(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (textFileExts.has(ext)) return true;
  const base = path.basename(filePath).toLowerCase();
  return base === "anchor.toml" || base === "cargo.toml" || base === "readme";
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env") continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
      continue;
    }
    const full = path.join(dir, entry.name);
    if (shouldScan(full)) out.push(full);
  }
  return out;
}

let changedFiles = 0;
let replacements = 0;

for (const file of walk(repoRoot)) {
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }

  let next = content;
  for (const oldId of oldIds) {
    if (!oldId) continue;
    const before = next;
    next = next.split(oldId).join(NEW_ID);
    if (next !== before) {
      replacements +=
        (before.length - next.length) / (oldId.length - NEW_ID.length || 1);
    }
  }

  if (next !== content) {
    fs.writeFileSync(file, next, "utf8");
    changedFiles += 1;
    console.log(`updated: ${path.relative(repoRoot, file)}`);
  }
}

console.log(`\nDone. Changed files: ${changedFiles}`);
console.log(`Target program id: ${NEW_ID}`);
