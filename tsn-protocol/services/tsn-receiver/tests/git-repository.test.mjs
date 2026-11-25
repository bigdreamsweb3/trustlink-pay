import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { checkPrivateTree, commitPushReceiver, fetchReceiver, gitEnvironment, isPrivatePath, main, networkArguments, openRepository, packageDestination, pushTimeout, receiverRoot, receiverUrl, validateConfiguration } from "../scripts/git-repository.mjs";

const privateFiles = [".env.production", "firebase.service-account.json", "mother-keypair.json", ".receiver-store.json",
  ".dev.vars", ".dev.vars.production", "private/.env.example", "record-store-worker/private/storage-token.env",
  "private-state/records.json", "secrets/token.txt", "credentials/account.json", "keys/signer.json", ".keys/text", ".node-cache/reply.json",
  "storage-token.env", "storage-token.env.backup", "signer.pem", "account.key", "receiver.import.sql", "receiver.export.sql",
  "receiver-export-test.json", "receiver.sqlite", "record-store-worker/wrangler.toml"];

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, env: gitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 0, "Synthetic fixture Git operation failed.");
  return result.stdout.trim();
}

function fixture(standalone = false) {
  const temp = mkdtempSync(join(tmpdir(), "trustlink-receiver-git-test-"));
  const top = join(temp, "protocol");
  const root = standalone ? top : join(top, "services", "tsn-receiver");
  mkdirSync(root, { recursive: true });
  const template = join(temp, "template");
  mkdirSync(template);
  git(["init", "--initial-branch=main", `--template=${template}`, top]);
  git(["config", "user.name", "Synthetic Fixture"], top);
  git(["config", "user.email", "fixture@example.invalid"], top);
  git(["config", "core.hooksPath", template], top);
  git(["config", "remote.origin.url", standalone ? receiverUrl : "https://github.com/Trustlink-Labs/TSN-Protocol.git"], top);
  writeFileSync(join(root, "package.json"), JSON.stringify({ repository: { type: "git", url: `git+${receiverUrl}` } }));
  copyFileSync(join(receiverRoot, ".gitignore"), join(root, ".gitignore"));
  writeFileSync(join(root, "receiver.txt"), "initial Receiver\n");
  if (!standalone) writeFileSync(join(top, "protocol-only.txt"), "protocol\n");
  git(["add", "--all"], top);
  git(["-c", "commit.gpgSign=false", "commit", "-m", "Synthetic initial commit"], top);
  const initial = git(["rev-parse", "HEAD"], top);
  return { temp, top, root, initial, dispose() {
    assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + sep));
    assert.ok(temp.includes("trustlink-receiver-git-test-"));
    rmSync(temp, { recursive: true, force: true });
  } };
}

function syntheticNetwork(repo, fetchHead = null, pushStatus = 0) {
  const calls = [];
  const run = (executable, args, options) => {
    assert.ok(!executable.includes("synthetic"));
    const command = args.includes("push") ? "push" : "fetch";
    const index = args.indexOf(command);
    assert.ok(index >= 0);
    assert.equal(args.at(-2), receiverUrl);
    assert.ok(args.includes("credential.helper="));
    assert.ok(args.includes("http.followRedirects=false"));
    assert.equal(options.env.GIT_TERMINAL_PROMPT, "0");
    calls.push({ command, args, options });
    if (command === "fetch") {
      if (!fetchHead) return { status: 128, stdout: "", stderr: "fatal: couldn't find remote ref refs/heads/main" };
      // Copy synthetic local objects only; no GitHub/network operation runs.
      git(["--git-dir", repo.gitDir, "-c", "protocol.file.allow=always", "fetch", "--no-tags", "--", fetchHead.top, `${fetchHead.initial}:refs/remotes/origin/main`]);
    }
    return { status: command === "push" ? pushStatus : 0, stdout: "", stderr: "synthetic-private-diagnostic" };
  };
  return { run, calls };
}

test("nested Receiver publication captures only its files and preserves protocol HEAD/index", () => {
  const f = fixture();
  const upstream = fixture(true);
  try {
    writeFileSync(join(upstream.root, "remote-only.txt"), "old remote file\n");
    git(["add", "remote-only.txt"], upstream.root);
    git(["-c", "commit.gpgSign=false", "commit", "-m", "Synthetic remote-only file"], upstream.root);
    upstream.initial = git(["rev-parse", "HEAD"], upstream.root);
    writeFileSync(join(f.top, "protocol-only.txt"), "unrelated staged edit\n");
    git(["add", "protocol-only.txt"], f.top);
    const originalIndex = readFileSync(join(f.top, ".git", "index"));
    writeFileSync(join(f.root, "receiver.txt"), "Receiver update\n");
    writeFileSync(join(f.root, "new.txt"), "new Receiver file\n");
    for (const name of privateFiles) {
      mkdirSync(resolve(f.root, name, ".."), { recursive: true });
      writeFileSync(join(f.root, name), "synthetic-private\n");
    }
    // In an independent Receiver publication, the Worker keeps its own ignore rule.
    writeFileSync(join(f.root, "record-store-worker", ".gitignore"), "wrangler.toml\n");
    const repo = openRepository(f.root);
    assert.equal(repo.gitDir, join(f.top, ".git", "trustlink-receiver-publication.git"));
    const network = syntheticNetwork(repo, upstream);
    const commit = commitPushReceiver(repo, { runNetwork: network.run });
    assert.deepEqual(network.calls.map(call => call.command), ["fetch", "push"]);
    assert.equal(git(["--git-dir", repo.gitDir, "rev-parse", `${commit}^`]), upstream.initial);
    const files = git(["--git-dir", repo.gitDir, "ls-tree", "-r", "--name-only", commit]).split("\n");
    assert.deepEqual(files, [".gitignore", "new.txt", "package.json", "receiver.txt", "record-store-worker/.gitignore"]);
    assert.equal(git(["rev-parse", "HEAD"], f.top), f.initial);
    assert.deepEqual(readFileSync(join(f.top, ".git", "index")), originalIndex);
    assert.equal(network.calls[1].args.at(-1), `${commit}:refs/heads/main`);
    assert.equal(git(["--git-dir", repo.gitDir, "rev-parse", "refs/remotes/origin/main"]), commit);
    unlinkSync(join(f.root, "new.txt"));
    const deleted = commitPushReceiver(repo, { runNetwork: network.run });
    assert.deepEqual(git(["--git-dir", repo.gitDir, "ls-tree", "-r", "--name-only", deleted]).split("\n"), [".gitignore", "package.json", "receiver.txt", "record-store-worker/.gitignore"]);
    assert.equal(git(["--git-dir", repo.gitDir, "rev-parse", `${deleted}^`]), commit);
    assert.equal(git(["rev-parse", "HEAD"], f.top), f.initial);
    assert.deepEqual(readFileSync(join(f.top, ".git", "index")), originalIndex);
  } finally { f.dispose(); upstream.dispose(); }
});

test("empty destinations receive a Receiver root commit and failed pushes retry the same commit", () => {
  const f = fixture();
  try {
    const repo = openRepository(f.root);
    const rejected = syntheticNetwork(repo, null, 1);
    assert.throws(() => commitPushReceiver(repo, { runNetwork: rejected.run }), error => {
      assert.match(error.message, /local Receiver commit is retained/);
      assert.doesNotMatch(error.message, /synthetic-private-diagnostic/);
      return true;
    });
    const retained = git(["--git-dir", repo.gitDir, "rev-parse", "HEAD"]);
    assert.equal(git(["--git-dir", repo.gitDir, "rev-list", "--count", "HEAD"]), "1");
    const retry = syntheticNetwork(repo);
    assert.equal(commitPushReceiver(repo, { runNetwork: retry.run }), retained);
    assert.deepEqual(retry.calls.map(call => call.command), ["push"]);
    assert.equal(git(["rev-parse", "HEAD"], f.top), f.initial);
    assert.equal(existsSync(join(repo.gitDir, "trustlink-publication.lock")), false);
  } finally { f.dispose(); }
});

test("standalone Receiver clones use their own Git boundary and need no parent helper", () => {
  const f = fixture(true);
  try {
    const repo = openRepository(f.root);
    assert.equal(repo.gitDir, join(f.root, ".git"));
    writeFileSync(join(f.root, "receiver.txt"), "standalone update\n");
    const network = syntheticNetwork(repo);
    const commit = commitPushReceiver(repo, { runNetwork: network.run });
    assert.equal(git(["rev-parse", `${commit}^`], f.root), f.initial);
    assert.deepEqual(network.calls.map(call => call.command), ["push"]);
    git(["checkout", "-b", "other"], f.root);
    assert.throws(() => commitPushReceiver(repo, { runNetwork: network.run }), /existing main branch/);
    assert.equal(git(["branch", "--show-current"], f.root), "other");
  } finally { f.dispose(); }
});

test("fetch changes only Receiver tracking metadata, without merging source or changing HEAD", () => {
  const f = fixture();
  const upstream = fixture(true);
  try {
    const repo = openRepository(f.root);
    const network = syntheticNetwork(repo, upstream);
    assert.equal(fetchReceiver(repo, network.run), upstream.initial);
    assert.equal(git(["rev-parse", "HEAD"], f.top), f.initial);
    assert.equal(readFileSync(join(f.root, "receiver.txt"), "utf8"), "initial Receiver\n");
    assert.deepEqual(network.calls.map(call => call.command), ["fetch"]);
    assert.throws(() => fetchReceiver(repo, () => ({ status: 128, stderr: "Authentication failed: synthetic-secret" }), true), /Receiver fetch failed/);
  } finally { f.dispose(); upstream.dispose(); }
});

test("wrong package/remotes, URL rewrites and private tracked files cannot be published", () => {
  const f = fixture();
  try {
    const repo = openRepository(f.root);
    const network = syntheticNetwork(repo);
    writeFileSync(join(f.root, "package.json"), JSON.stringify({ repository: { type: "git", url: "git+https://github.com/Trustlink-Labs/TSN-Protocol.git" } }));
    assert.throws(() => packageDestination(f.root), /approved/);
    assert.throws(() => commitPushReceiver(repo, { runNetwork: network.run }), /approved/);
    assert.equal(network.calls.length, 0);
    writeFileSync(join(f.root, "package.json"), JSON.stringify({ repository: { type: "git", url: receiverUrl } }));
    git(["--git-dir", repo.gitDir, "config", "remote.origin.pushurl", "https://github.com/attacker/receiver.git"]);
    assert.throws(() => validateConfiguration(repo), /destination/);
    git(["--git-dir", repo.gitDir, "config", "--unset", "remote.origin.pushurl"]);
    git(["--git-dir", repo.gitDir, "config", "url.https://example.invalid/.insteadOf", "https://github.com/"]);
    assert.throws(() => validateConfiguration(repo), /URL rewrites/);
    git(["--git-dir", repo.gitDir, "config", "--unset", "url.https://example.invalid/.insteadOf"]);
    writeFileSync(join(f.root, ".env.production"), "synthetic-private\n");
    git(["--git-dir", repo.gitDir, "--work-tree", f.root, "add", "--force", ".env.production"], f.root);
    const tree = git(["--git-dir", repo.gitDir, "write-tree"]);
    assert.throws(() => checkPrivateTree(repo, tree), /private configuration/);
    assert.throws(() => commitPushReceiver(repo, { runNetwork: network.run }), /private configuration/);
    assert.equal(network.calls.filter(call => call.command === "push").length, 0);
  } finally { f.dispose(); }
});

test("Receiver network commands pin main, disable force/recursion and validate timeout before mutations", () => {
  const repo = { gitDir: "synthetic", root: "synthetic", hooks: "synthetic" };
  const args = networkArguments(repo, "push", "a".repeat(40));
  assert.equal(args.at(-2), receiverUrl);
  assert.equal(args.at(-1), `${"a".repeat(40)}:refs/heads/main`);
  assert.ok(args.includes("push.recurseSubmodules=no"));
  assert.ok(!args.some(arg => /--force|^\+/.test(arg)));
  assert.equal(pushTimeout({}), 900000);
  assert.throws(() => pushTimeout({ TRUSTLINK_GIT_PUSH_TIMEOUT_MS: "0" }), /TIMEOUT/);
  assert.throws(() => main(["commit-push-all", "protocol", "origin", "main"], "missing"), /Usage/);
  assert.throws(() => main(["fetch", "receiver", "origin", "other"], "missing"), /Usage/);
});

test("forced staging cannot bypass private-directory, secret-file and state guards", () => {
  const f = fixture();
  try {
    const repo = openRepository(f.root);
    for (const name of privateFiles) {
      mkdirSync(resolve(f.root, name, ".."), { recursive: true });
      writeFileSync(join(f.root, name), "synthetic-private\n");
      git(["--git-dir", repo.gitDir, "--work-tree", f.root, "add", "--force", "--", name], f.root);
      assert.throws(() => checkPrivateTree(repo, git(["--git-dir", repo.gitDir, "write-tree"])), /private configuration/, name);
      git(["--git-dir", repo.gitDir, "--work-tree", f.root, "rm", "--cached", "--", name], f.root);
    }
    for (const name of [".env.example", "nested/.env.sample", ".env.template", "wrangler.example.toml", "schema.sql", "initialize-empty.sql", "src/worker.mjs"]) assert.equal(isPrivatePath(name), false, name);
    for (const name of privateFiles) assert.equal(isPrivatePath(name), true, name);
  } finally { f.dispose(); }
});
