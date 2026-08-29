import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, "protocol-tests", "tcap-credit-devnet.env");
const node = process.execPath;

function run(label, args, env = process.env) {
  console.log(`[devnet] ${label}`);
  const result = spawnSync(node, args, { cwd: root, stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("Bootstrap governed TSN/TCAP accounts", [
  "protocol-tests/scenarios/tcap-credit-bootstrap.mjs",
]);

if (!fs.existsSync(envFile)) {
  console.error(`[devnet] Missing generated environment file: ${envFile}`);
  process.exit(1);
}

const generated = {};
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) generated[match[1]] = match[2];
}

run("Run TCAP credit smoke", ["tcap-protocol/scripts/devnet-credit-smoke.mjs"], {
  ...process.env,
  ...generated,
});
