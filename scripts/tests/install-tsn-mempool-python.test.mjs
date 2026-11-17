import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("automatic Python installation rejects before launching any interpreter", () => {
  const directory = mkdtempSync(join(tmpdir(), "tsn-python-install-guard-"));
  try {
    const preload = join(directory, "block-child-process.cjs");
    writeFileSync(preload, `
      const childProcess = require("node:child_process");
      for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
        childProcess[name] = () => {
          process.stderr.write("UNEXPECTED_CHILD_PROCESS\\n");
          process.exit(97);
        };
      }
      require("node:module").syncBuiltinESMExports();
    `);
    const installer = fileURLToPath(new URL("../install-tsn-mempool-python.mjs", import.meta.url));
    const result = spawnSync(process.execPath, ["--require", preload, installer, "--allow-unlocked"], {
      cwd: directory,
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, NODE_OPTIONS: "", TSN_REQUIREMENTS_LOCK: join(directory, "unreviewed.lock") },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no reviewed, fully pinned lock with artifact hashes/);
    assert.match(result.stderr, /Manual pip installs and Docker builds are outside this guard/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /UNEXPECTED_CHILD_PROCESS/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
