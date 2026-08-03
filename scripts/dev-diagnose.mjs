import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const skip = new Set(["node_modules", ".next", "dist", "build", "coverage", "__pycache__", ".pytest_cache", ".venv", "venv", ".git", "target", ".tsn-logs"]);

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function countFiles(dir) {
  let count = 0;
  function walk(abs) {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = join(abs, entry.name);
      if (entry.isDirectory()) walk(full);
      else count += 1;
    }
  }
  if (existsSync(join(root, dir))) walk(join(root, dir));
  return count;
}

function version(command, args) {
  return new Promise((resolveVersion) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", () => resolveVersion(out.trim() || "unavailable"));
    child.on("error", () => resolveVersion("unavailable"));
  });
}

function measureNextReady(app, script = "dev:turbo") {
  return new Promise((resolveMeasure) => {
    const started = Date.now();
    const child = spawn("npm", ["--prefix", app, "run", script], {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    const finish = (result) => {
      if (!child.killed) child.kill("SIGTERM");
      resolveMeasure(result);
    };

    const timer = setTimeout(() => finish({ ready: false, ms: Date.now() - started, reason: "timeout" }), 120_000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (/Ready in|Local:|started server/i.test(output)) {
        clearTimeout(timer);
        finish({ ready: true, ms: Date.now() - started, reason: "ready" });
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ready: false, ms: Date.now() - started, reason: error.message });
    });
  });
}

const measure = process.argv.includes("--measure");
const frontendPkg = readJson("frontend/package.json");
const backendPkg = readJson("backend/package.json");
const mempoolPkg = readJson("tsn-protocol/tsn-mempool-ui/package.json");

console.log("TrustLink dev diagnostics");
console.log(`cwd: ${root}`);
console.log(`under /mnt/c: ${resolve(root).startsWith("/mnt/c/")}`);
console.log(`node: ${process.version}`);
console.log(`npm: ${await version("npm", ["--version"])}`);
console.log(`wsl: ${await version("wslinfo", ["--wsl-version"])}`);
console.log(`frontend next: ${frontendPkg.dependencies.next}`);
console.log(`backend next: ${backendPkg.dependencies.next}`);
console.log(`TSN Mempool UI next: ${mempoolPkg.dependencies.next}`);
console.log(`frontend files: ${countFiles("frontend")}`);
console.log(`backend files: ${countFiles("backend")}`);
console.log(`TSN Mempool UI files: ${countFiles("tsn-protocol/tsn-mempool-ui")}`);
console.log("dev bundler: Turbopack when using npm run frontend:dev:turbo / backend:dev:turbo / mempool:frontend:dev:turbo");

if (measure) {
  const result = await measureNextReady("frontend");
  console.log(`frontend ready: ${result.ready} ${result.ms}ms (${result.reason})`);
}
