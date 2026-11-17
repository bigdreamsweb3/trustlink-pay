import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const disabledCommand = 'node -e "console.error(\'Automatic staging, commits, pushes, and branch changes are disabled. Review changes and use explicit Git commands with your approval.\'); process.exit(1)"';
const disabledImports = 'node -e "console.error(\'Automatic Git imports are disabled. Fetch only approved sources with node scripts/repo-security.mjs fetch, then review before merging.\'); process.exit(1)"';
const routes = new Map([
  ["package.json", {
    "git:pull:all": "node scripts/repo-security.mjs fetch workspace origin main",
    "git:pull:protocol": "node scripts/repo-security.mjs fetch protocol origin main",
    "git:push:current": "node scripts/repo-security.mjs push-current workspace origin main",
    "git:push:tsn-protocol": "node scripts/repo-security.mjs commit-push-all protocol origin main",
    "git:commit:push:staged": "node scripts/repo-security.mjs commit-push workspace origin main",
    "git:commit:push:all": "node scripts/repo-security.mjs commit-push-all workspace origin main",
  }],
  ["tsn-protocol/package.json", {
    "git:pull:all": "node scripts/repo-security.mjs fetch protocol origin main",
    "git:push:current": "node scripts/repo-security.mjs push-current protocol origin main",
    "git:push:all": "node scripts/repo-security.mjs commit-push-all protocol origin main",
    "git:commit:push:staged": "node scripts/repo-security.mjs commit-push protocol origin main",
    "git:commit:push:all": "node scripts/repo-security.mjs commit-push-all protocol origin main",
  }],
  ["tsn-protocol/services/tsn-rpc-gateway/package.json", {
    "git:pull:all": "node ../../scripts/repo-security.mjs fetch protocol origin main",
    "git:commit:push:all": "node ../../scripts/repo-security.mjs commit-push-all protocol origin main",
  }],
  ["tsn-protocol/services/tsn-receiver/package.json", {
    "git:pull:all": "node ../../scripts/repo-security.mjs fetch protocol origin main",
    "git:commit:push:all": "node ../../scripts/repo-security.mjs commit-push-all protocol origin main",
  }],
  ["tsn-protocol/services/tsn-node/package.json", {
    "git:pull:all": "node ../../scripts/repo-security.mjs fetch protocol origin main",
    "git:commit:push:all": "node ../../scripts/repo-security.mjs commit-push-all protocol origin main",
  }],
  ["tsn-protocol/services/tsn-mempool-ui/package.json", {
    "git:quick:push": "node ../../scripts/repo-security.mjs push protocol origin main",
    "git:force:push": "node ../../scripts/repo-security.mjs push protocol origin main",
  }],
]);

function noAutomaticHooks(manifest, name, label) {
  assert.equal(manifest.scripts[`pre${name}`], undefined, `${label}: pre-script bypass`);
  assert.equal(manifest.scripts[`post${name}`], undefined, `${label}: post-script bypass`);
}

test("all source manifests route Git operations through exact guarded commands or disable them", () => {
  const excluded = new Set(["node_modules", ".git", "target", "build", "dist", "vendor", ".venv", ".next", "__pycache__", ".cache", "protocol-test-runs"]);
  let checked = 0;
  function visit(directory) {
    const path = join(directory, "package.json");
    if (existsSync(path)) {
      const manifest = JSON.parse(readFileSync(path, "utf8"));
      const relativePath = relative(root, path).split(sep).join("/");
      checked++;
      for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
        const label = `${relativePath} ${name}`;
        assert.doesNotMatch(command, /\bgit\s+(?:add|commit|push|pull|fetch|clone|branch\s+-M|remote\s+set-url|submodule\s+update)\b/, label);
        assert.doesNotMatch(command, /\brun\s+git:(?:commit:push:all|push:current|push:all|push:tsn-protocol|quick:push|force:push)\b/, label);
        const expected = routes.get(relativePath)?.[name];
        if (expected) {
          assert.equal(command, expected, label);
          noAutomaticHooks(manifest, name, label);
        } else if (/^git:pull:/.test(name)) {
          assert.equal(command, disabledImports, label);
          noAutomaticHooks(manifest, name, label);
        } else if (/^git:.*(?:commit|push)/.test(name) || name === "push") {
          assert.equal(command, disabledCommand, label);
          noAutomaticHooks(manifest, name, label);
        } else if (command === disabledCommand || command === disabledImports) {
          noAutomaticHooks(manifest, name, label);
        }
      }
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !excluded.has(entry.name)) visit(join(directory, entry.name));
    }
  }
  visit(root);
  assert.ok(checked >= routes.size);
});

for (const [relativePath, commands] of routes) {
  const manifestPath = join(root, relativePath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const [name, command] of Object.entries(commands)) {
    test(`${relativePath} ${name} uses its reviewed repository, remote, branch and guarded operation`, () => {
      assert.equal(manifest.scripts[name], command);
      noAutomaticHooks(manifest, name, `${relativePath} ${name}`);
      const tokens = command.split(" ");
      assert.equal(tokens.length, 6, "Routes supply repository, remote and branch; push-current captures HEAD, push requires a hash, and commit routes capture their selected scope");
      assert.equal(tokens[0], "node");
      assert.ok(["fetch", "push", "push-current", "commit-push", "commit-push-all"].includes(tokens[2]));
      assert.ok(["workspace", "protocol"].includes(tokens[3]));
      assert.equal(tokens[4], "origin");
      assert.equal(tokens[5], "main");
      assert.doesNotMatch(command, /--(?:force(?:-with-lease)?|no-verify|allow-empty)\b|\s-M\b/);
      const helper = resolve(dirname(manifestPath), tokens[1]);
      assert.equal(helper, resolve(root, relativePath === "package.json" ? "scripts/repo-security.mjs" : "tsn-protocol/scripts/repo-security.mjs"));
      assert.ok(existsSync(helper), "Guarded helper must exist at the package-relative route");
      // Routing checks never execute Git operations, npm lifecycle scripts, or the helper.
    });
  }
}

test("mempool quick and force aliases both use ordinary guarded push", () => {
  const manifest = JSON.parse(readFileSync(join(root, "tsn-protocol/services/tsn-mempool-ui/package.json"), "utf8"));
  assert.equal(manifest.scripts["git:force:push"], manifest.scripts["git:quick:push"]);
  assert.equal(manifest.scripts["git:force:push"], "node ../../scripts/repo-security.mjs push protocol origin main");
});
