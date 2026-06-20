import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import process from "node:process";

const args = new Set(process.argv.slice(2));
const shouldFix = args.has("--fix");
const warnOnly = args.has("--warn-only");
const writeReport = args.has("--write-report");
const includeSubmodules = !args.has("--no-submodules");

const allowedEnvFiles = new Set([".env.example", ".env.sample", ".env.template"]);

const rules = [
  {
    category: "Dependencies",
    reason: "Dependencies should be restored with package managers, not committed.",
    test: (path) => hasSegment(path, "node_modules") || hasSegment(path, ".pnpm-store"),
  },
  {
    category: "Build output",
    reason: "Build artifacts should be regenerated from source.",
    test: (path) =>
      ["dist", "build", ".next", "coverage", "target", ".turbo", ".cache", ".parcel-cache"].some(
        (segment) => hasSegment(path, segment),
      ) || path.endsWith(".tsbuildinfo"),
  },
  {
    category: "Secrets and local env",
    reason: "Local secrets and machine-specific environment files must stay out of Git.",
    test: (path) => {
      const name = basename(path);
      if (allowedEnvFiles.has(name)) return false;
      return (
        name === ".env" ||
        name.startsWith(".env.") ||
        name.endsWith(".service-account.json") ||
        name.includes("firebase-adminsdk") ||
        hasSegment(path, ".fb_creds")
      );
    },
  },
  {
    category: "Logs and local state",
    reason: "Runtime logs and local daemon state are not source code.",
    test: (path) => {
      const name = basename(path);
      return (
        name.endsWith(".log") ||
        name.startsWith("npm-debug.log") ||
        name.startsWith("yarn-debug.log") ||
        name.startsWith("yarn-error.log") ||
        name === ".mempool-store.json" ||
        name === "operator-state.json" ||
        (name.startsWith("operator-state") && name.endsWith(".json")) ||
        hasSegment(path, ".tsn")
      );
    },
  },
  {
    category: "Temporary files",
    reason: "Temporary helper files should not be committed.",
    test: (path) =>
      basename(path) === "tracked-node-modules.txt" ||
      basename(path) === ".DS_Store" ||
      basename(path) === "Thumbs.db",
  },
];

function runGit(cwd, gitArgs, options = {}) {
  return execFileSync("git", gitArgs, {
    cwd,
    encoding: options.encoding ?? "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function basename(path) {
  const normalized = normalizePath(path);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function hasSegment(path, segment) {
  return normalizePath(path).split("/").includes(segment);
}

function getTrackedFiles(cwd) {
  const output = runGit(cwd, ["ls-files", "-z"], { encoding: "buffer" });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalizePath);
}

function getSubmodulePaths(cwd) {
  if (!includeSubmodules) return [];

  try {
    const output = runGit(cwd, ["submodule", "status", "--recursive"]);
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/)[1])
      .filter(Boolean);
  } catch {
    return [];
  }
}

function collectRepo(cwd, label, displayPrefix = "") {
  const trackedFiles = getTrackedFiles(cwd);
  const matches = [];

  for (const file of trackedFiles) {
    const displayPath = displayPrefix ? `${displayPrefix}/${file}` : file;
    const rule = rules.find((candidate) => candidate.test(file));
    if (rule) {
      matches.push({
        category: rule.category,
        reason: rule.reason,
        repo: label,
        path: displayPath,
        gitPath: file,
      });
    }
  }

  return matches;
}

function collectAll() {
  const root = process.cwd();
  const matches = collectRepo(root, "root");

  for (const submodulePath of getSubmodulePaths(root)) {
    try {
      runGit(submodulePath, ["rev-parse", "--is-inside-work-tree"]);
      matches.push(...collectRepo(submodulePath, submodulePath, normalizePath(submodulePath)));
    } catch {
      console.warn(`[warn] Skipping uninitialized submodule: ${submodulePath}`);
    }
  }

  return matches;
}

function groupByCategory(matches) {
  const groups = new Map();
  for (const match of matches) {
    if (!groups.has(match.category)) groups.set(match.category, []);
    groups.get(match.category).push(match);
  }
  return groups;
}

function printReport(matches) {
  if (matches.length === 0) {
    console.log("Git hygiene check passed. No tracked dependency, build, secret, log, or temp files found.");
    return "";
  }

  const lines = [
    `Git hygiene check found ${matches.length} tracked file(s) that should usually stay out of Git.`,
    "",
  ];

  for (const [category, categoryMatches] of groupByCategory(matches)) {
    lines.push(`${category} (${categoryMatches.length})`);
    lines.push(`Reason: ${categoryMatches[0].reason}`);

    for (const match of categoryMatches.slice(0, 80)) {
      lines.push(`- ${match.path}`);
    }

    if (categoryMatches.length > 80) {
      lines.push(`- ... ${categoryMatches.length - 80} more`);
    }

    lines.push("");
  }

  lines.push("To untrack these files without deleting them locally, run:");
  lines.push("npm run git:hygiene:fix");
  lines.push("");

  const report = lines.join("\n");
  console.log(report);
  return report;
}

function untrackMatches(matches) {
  const byRepo = new Map();
  for (const match of matches) {
    if (!byRepo.has(match.repo)) byRepo.set(match.repo, []);
    byRepo.get(match.repo).push(match.gitPath);
  }

  for (const [repo, files] of byRepo) {
    const cwd = repo === "root" ? process.cwd() : repo;
    const chunkSize = 100;

    for (let index = 0; index < files.length; index += chunkSize) {
      const chunk = files.slice(index, index + chunkSize);
      const result = spawnSync("git", ["rm", "--cached", "--", ...chunk], {
        cwd,
        encoding: "utf8",
        stdio: "inherit",
      });

      if (result.status !== 0) {
        throw new Error(`git rm --cached failed in ${repo}`);
      }
    }
  }
}

const matches = collectAll();
const report = printReport(matches);

if (writeReport && report) {
  writeFileSync("git-hygiene-report.txt", report);
  console.log("Wrote git-hygiene-report.txt");
}

if (shouldFix && matches.length > 0) {
  untrackMatches(matches);
  console.log("Untracked matched files from Git index. Local files were not deleted.");
}

if (matches.length > 0 && !warnOnly && !shouldFix) {
  process.exitCode = 1;
}
