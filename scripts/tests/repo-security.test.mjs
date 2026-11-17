import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { checkPrivateTracking, checkRepository, commitPushAll, commitPushOptions, commitPushStaged, commitStagedSnapshot, configuration, defaultCommitMessage, fetchArguments, gitEnvironment, gitExecutable, gitFailureMessage, hardenRepository, main, normalizeKey, pushArguments, pushCurrent, requireReviewedHash, stageAllChanges, stagedCommitSnapshot, trustedRemotes, validateRemote, workspace } from "../repo-security.mjs";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "trustlink-git-policy-test-"));
  const template = join(directory, "empty-template");
  mkdirSync(template);
  const result = spawnSync("git", ["init", `--template=${template}`, join(directory, "repo")], { encoding: "utf8", env: gitEnvironment(), windowsHide: true });
  assert.equal(result.status, 0);
  const gitDir = join(directory, "repo", ".git");
  function config(key, value) {
    const result = spawnSync("git", ["--git-dir", gitDir, "config", "--local", "--replace-all", key, value], { encoding: "utf8", env: gitEnvironment(), windowsHide: true });
    assert.equal(result.status, 0);
  }
  function git(args) {
    const result = spawnSync("git", ["-C", join(directory, "repo"), ...args], { encoding: "utf8", env: gitEnvironment(), windowsHide: true, timeout: 15000 });
    assert.equal(result.status, 0, "Synthetic fixture Git operation failed.");
    return result.stdout.trim();
  }
  function initialCommit() {
    config("user.name", "Synthetic Fixture");
    config("user.email", "fixture@example.invalid");
    hardenRepository(gitDir, join(directory, "before.config"));
    git(["symbolic-ref", "HEAD", "refs/heads/main"]);
    writeFileSync(join(directory, "repo", "reviewed.txt"), "initial\n");
    git(["add", "--", "reviewed.txt"]);
    git(["commit", "--no-gpg-sign", "-m", "Synthetic initial commit"]);
    return git(["rev-parse", "HEAD"]);
  }
  return { directory, gitDir, config, git, initialCommit, dispose() {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/")));
    assert.ok(directory.includes("trustlink-git-policy-test-"));
    rmSync(directory, { recursive: true, force: true });
  } };
}

test("exact approved repository destinations, branches, and push destinations are required", () => {
  const expected = trustedRemotes.workspace.origin;
  const config = new Map([["remote.origin.url", [expected]]]);
  assert.equal(validateRemote(config, "workspace", "origin", "feature/review"), expected);
  for (const url of ["https://github.com/attacker/repo.git", expected + "/", expected.replace("github.com", "github.com.attacker.invalid"), expected.replace("https://", "https://user:secret@"), "git@github.com:bigdreamsweb3/trustlink-pay.git"]) {
    assert.throws(() => validateRemote(new Map([["remote.origin.url", [url]]]), "workspace", "origin", "main"));
  }
  assert.throws(() => validateRemote(new Map([["remote.origin.url", [expected, expected]]]), "workspace", "origin", "main"));
  assert.throws(() => validateRemote(new Map([...config, ["remote.origin.pushurl", ["https://github.com/attacker/repo.git"]]]), "workspace", "origin", "main"));
  for (const branch of ["--upload-pack=evil", "main:other", "../main", "a//b", "refs/a.lock", "main\nother", "main;command"]) assert.throws(() => validateRemote(config, "workspace", "origin", branch));
  for (const pair of [["other", "origin"], ["__proto__", "origin"], ["workspace", "constructor"], ["protocol", "tsn-protocol"]]) assert.throws(() => validateRemote(config, ...pair, "main"));
});

test("URL rewrite and ambient Git injection cannot redirect the reviewed fetch", () => {
  const base = [ ["remote.origin.url", [trustedRemotes.workspace.origin]] ];
  for (const suffix of ["insteadof", "pushinsteadof"]) assert.throws(() => validateRemote(new Map([...base, [`url.https://attacker.invalid/.${suffix}`, ["https://github.com/"]]]), "workspace", "origin", "main"));
  const env = gitEnvironment({ PATH: "trusted", GIT_CONFIG_COUNT: "1", git_dir: "other", GIT_EXEC_PATH: "evil", GIT_CONFIG_GLOBAL: "evil", GIT_SSH_COMMAND: "evil", GIT_TERMINAL_PROMPT: "1", GCM_TRACE: "true", GCM_TRACE_SECRETS: "true", GCM_CREDENTIAL_STORE: "plaintext" });
  assert.deepEqual(env, { PATH: "trusted", GIT_TERMINAL_PROMPT: "0" });
  const argv = fetchArguments("/fixture/.git", trustedRemotes.workspace.origin, "origin", "main");
  assert.ok(argv.includes("credential.helper="));
  assert.ok(argv.includes("http.followRedirects=false"));
  assert.ok(argv.includes("--no-recurse-submodules"));
  assert.ok(argv.includes("--no-auto-maintenance"));
  assert.deepEqual(argv.slice(-3), ["--", trustedRemotes.workspace.origin, "refs/heads/main:refs/remotes/origin/main"]);
  assert.equal(argv.includes("pull"), false);
});

test("hardening backs up local configuration, denies transports, disables hooks and submodules", () => {
  const f = fixture();
  try {
    f.config("core.fsmonitor", "true");
    f.config("protocol.ext.allow", "always");
    f.config("submodule.external.active", "true");
    f.config("submodule.external.update", "checkout");
    const original = readFileSync(join(f.gitDir, "config"));
    const backup = join(f.directory, "before.config");
    hardenRepository(f.gitDir, backup);
    assert.deepEqual(readFileSync(backup), original);
    const config = checkRepository(f.gitDir);
    assert.equal(config.get("core.fsmonitor").at(-1), "false");
    assert.equal(config.get("submodule.external.active").at(-1), "false");
    assert.equal(config.get("submodule.external.update").at(-1), "none");
    for (const url of ["https://example.invalid/unapproved.git", "file:///unapproved", "ext::unapproved-helper"]) {
      const result = spawnSync("git", ["--git-dir", f.gitDir, "fetch", "--", url], { encoding: "utf8", env: gitEnvironment(), windowsHide: true, timeout: 5000 });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /transport .* not allowed/);
    }
    assert.throws(() => hardenRepository(f.gitDir, backup), /exist/i);
    f.config("core.fsmonitor", "true");
    assert.throws(() => checkRepository(f.gitDir), /core.fsmonitor/);
    f.config("core.fsmonitor", "false");
    writeFileSync(join(f.gitDir, "trustlink-disabled-hooks", "post-checkout"), "unexpected");
    assert.throws(() => checkRepository(f.gitDir), /hooks directory/);
  } finally { f.dispose(); }
});

test("direct documentation importer fails before loading any subprocess code", () => {
  const script = join(workspace, "scripts", "pull-tsn-docs.mjs");
  assert.doesNotMatch(readFileSync(script, "utf8"), /child_process|execFile|spawn|\bgit\s*\(/);
  const result = spawnSync(process.execPath, [script, "--force"], { encoding: "utf8", env: { ...process.env, TSN_DOCS_DIR: "unexpected", TSN_DOCS_BRANCH: "unexpected" }, timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /imports are disabled/);
  assert.equal(result.stdout, "");
});

test("case-sensitive Git subsections cannot conceal transport or scoped HTTP exceptions", () => {
  assert.equal(normalizeKey("Protocol.HTTPS.Allow"), "protocol.HTTPS.allow");
  assert.equal(normalizeKey("HTTP.https://github.com/Trustlink-Labs/.SSLVerify"), "http.https://github.com/Trustlink-Labs/.sslverify");
  const f = fixture();
  try {
    hardenRepository(f.gitDir, join(f.directory, "before.config"));
    f.config("protocol.https.allow", "always");
    f.config("protocol.HTTPS.allow", "never");
    const config = configuration(f.gitDir);
    assert.equal(config.get("protocol.https.allow").at(-1), "always");
    assert.equal(config.get("protocol.HTTPS.allow").at(-1), "never");
    assert.throws(() => checkRepository(f.gitDir), /protocol.https.allow/);
    f.config("protocol.https.allow", "never");
    f.config("http.https://github.com/Trustlink-Labs/.followRedirects", "true");
    f.config("http.https://github.com/trustlink-labs/.followRedirects", "false");
    assert.throws(() => checkRepository(f.gitDir), /redirect exception/);
  } finally { f.dispose(); }
});

test("the private-state gate catches forced tracking while retaining public env examples", () => {
  const f = fixture();
  try {
    const repo = join(f.directory, "repo");
    writeFileSync(join(repo, ".env.example"), "EXAMPLE=placeholder\n");
    let result = spawnSync("git", ["-C", repo, "add", "--", ".env.example"], { env: gitEnvironment(), encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0);
    checkPrivateTracking(f.gitDir);
    for (const filename of [".receiver-store.json", ".receiver-store.json.lock", ".receiver-store.json.1234.synthetic.tmp", ".receiver-store.before-reset.json.bak", ".receiver-store"]) {
      writeFileSync(join(repo, filename), "{}\n");
      result = spawnSync("git", ["-C", repo, "add", "--", filename], { env: gitEnvironment(), encoding: "utf8", windowsHide: true });
      assert.equal(result.status, 0);
      assert.throws(() => checkPrivateTracking(f.gitDir), /private configuration\/state filename/);
      assert.equal(readFileSync(join(repo, filename), "utf8"), "{}\n");
      result = spawnSync("git", ["-C", repo, "rm", "--cached", "--", filename], { env: gitEnvironment(), encoding: "utf8", windowsHide: true });
      assert.equal(result.status, 0);
      checkPrivateTracking(f.gitDir);
    }
  } finally { f.dispose(); }
});

test("push requires a full reviewed hash before any Git operation", () => {
  const head = "a".repeat(40);
  requireReviewedHash(head, head);
  for (const supplied of [undefined, "HEAD", "main", "--force", head.slice(0, 8), "b".repeat(40)]) assert.throws(() => requireReviewedHash(supplied, head));
  assert.throws(() => main(["push", "workspace", "origin", "main"]), /reviewed commit hash/);
  const args = pushArguments("/fixture/.git", trustedRemotes.workspace.origin, "main", head);
  assert.deepEqual(args.slice(-3), ["--", trustedRemotes.workspace.origin, `${head}:refs/heads/main`]);
  assert.ok(args.includes("--no-follow-tags"));
  assert.ok(args.includes("push.recurseSubmodules=no"));
  assert.ok(!args.some(arg => arg === "--force" || arg === "--force-with-lease" || arg.startsWith("+")));
});

test("commit/push defaults and optional overrides are validated before repository access", () => {
  const tree = "a".repeat(40);
  assert.deepEqual(commitPushOptions(), { reviewedTree: undefined, message: defaultCommitMessage });
  assert.deepEqual(commitPushOptions([tree]), { reviewedTree: tree, message: defaultCommitMessage });
  assert.deepEqual(commitPushOptions([tree, "Reviewed security controls"]), { reviewedTree: tree, message: "Reviewed security controls" });
  for (const overrides of [["HEAD"], [tree.slice(0, 8)], [tree, " "], [tree, "invalid\0message"], [tree, "message", "extra"]]) {
    assert.throws(() => commitPushOptions(overrides));
    assert.throws(() => main(["commit-push", "workspace", "origin", "main", ...overrides]));
  }
  assert.throws(() => main(["commit-push", "workspace", "origin"]), /explicit repository, remote and branch/);
});

test("failure classification reveals actionable categories without echoing sensitive diagnostics", () => {
  const secret = "https://synthetic-user:synthetic-secret@fixture.invalid/private";
  const cases = [
    [{ error: { code: "ETIMEDOUT", message: secret } }, /timed out/],
    [{ error: { code: "ENOBUFS", message: secret } }, /capture buffer/],
    [{ error: { code: "ENOENT", message: secret } }, /executable is unavailable/],
    [{ stderr: `Unable to create '${secret}/index.lock': File exists.` }, /repository lock/],
    [{ stderr: `fatal: ${secret}: Permission denied` }, /filesystem permissions/],
    [{ stderr: `fatal: ${secret}: No space left on device` }, /disk is full/],
    [{ stderr: `error: '${secret}' does not have a commit checked out` }, /embedded repository/],
    [{ stderr: `error: ${secret}: Filename too long` }, /path is unsupported/],
    [{ stdout: `! ${secret} [rejected] (non-fast-forward)` }, /reconciliation; force push is disabled/],
    [{ stderr: `Authentication failed for '${secret}'` }, /authentication or repository permission/],
    [{ stderr: `Could not resolve host: ${secret}` }, /could not connect/],
    [{ stderr: secret, status: 128 }, /unclassified failure/],
  ];
  for (const [result, expected] of cases) {
    const message = gitFailureMessage(result, "Workspace staging");
    assert.match(message, expected);
    assert.doesNotMatch(message, /synthetic-user|synthetic-secret|fixture\.invalid/);
    assert.match(message, /diagnostics were withheld/);
  }
});

test("whole-workspace staging reports a real index lock and preserves both index and HEAD", () => {
  const f = fixture();
  try {
    const parent = f.initialCommit();
    const tree = f.git(["write-tree"]);
    const repo = { name: "synthetic", gitDir: f.gitDir };
    writeFileSync(join(f.directory, "repo", "reviewed.txt"), "pending update\n");
    const lock = join(f.gitDir, "index.lock");
    writeFileSync(lock, "Synthetic active Git lock\n");
    assert.throws(() => stageAllChanges(repo, "main"), /Workspace staging failed.*repository lock/);
    assert.equal(readFileSync(lock, "utf8"), "Synthetic active Git lock\n");
    rmSync(lock);
    assert.equal(f.git(["rev-parse", "HEAD"]), parent);
    assert.equal(f.git(["write-tree"]), tree);
    assert.equal(readFileSync(join(f.directory, "repo", "reviewed.txt"), "utf8"), "pending update\n");
  } finally { f.dispose(); }
});

test("current push captures HEAD without staging or committing pending workspace changes", () => {
  const f = fixture();
  try {
    const head = f.initialCommit();
    const repo = { name: "synthetic", gitDir: f.gitDir };
    writeFileSync(join(f.directory, "repo", "reviewed.txt"), "staged update\n");
    f.git(["add", "--", "reviewed.txt"]);
    const tree = f.git(["write-tree"]);
    writeFileSync(join(f.directory, "repo", "untracked.txt"), "pending addition\n");
    let pushed;
    assert.equal(pushCurrent(repo, trustedRemotes.workspace.origin, "main", (...args) => { pushed = args; }), head);
    assert.deepEqual(pushed, [repo, trustedRemotes.workspace.origin, "main", head]);
    assert.equal(f.git(["write-tree"]), tree);
    assert.equal(f.git(["rev-parse", "HEAD"]), head);
    assert.equal(f.git(["rev-list", "--count", "HEAD"]), "1");
    assert.throws(() => pushCurrent(repo, trustedRemotes.workspace.origin, "other", () => assert.fail("must not push")), /checked-out branch/);
  } finally { f.dispose(); }
  for (const args of [["push-current"], ["push-current", "workspace", "origin"], ["push-current", "workspace", "origin", "main", "--force"]]) {
    assert.throws(() => main(args), /explicit repository, remote and branch/);
  }
});

test("current push rejects private filenames in HEAD even when the current index removes them", () => {
  const f = fixture();
  try {
    f.initialCommit();
    writeFileSync(join(f.directory, "repo", ".receiver-store.json"), "{}\n");
    f.git(["add", "--", ".receiver-store.json"]);
    f.git(["commit", "--no-gpg-sign", "-m", "Synthetic forbidden snapshot"]);
    f.git(["rm", "--cached", "--", ".receiver-store.json"]);
    const tree = f.git(["write-tree"]);
    assert.throws(() => pushCurrent({ name: "synthetic", gitDir: f.gitDir }, trustedRemotes.workspace.origin, "main", () => assert.fail("must not push")), /private configuration\/state filename/);
    assert.equal(f.git(["write-tree"]), tree);
  } finally { f.dispose(); }
});

test("default commit/push captures deliberate staging and never adds unstaged or untracked files", () => {
  const f = fixture();
  try {
    const parent = f.initialCommit();
    const repo = { name: "synthetic", gitDir: f.gitDir };
    const directory = join(f.directory, "repo");
    writeFileSync(join(directory, "reviewed.txt"), "deliberately staged\n");
    f.git(["add", "--", "reviewed.txt"]);
    const stagedTree = f.git(["write-tree"]);
    writeFileSync(join(directory, "reviewed.txt"), "later unstaged work\n");
    writeFileSync(join(directory, "untracked.txt"), "untracked work\n");
    writeFileSync(join(directory, ".env"), "SYNTHETIC=placeholder\n");
    const pushes = [];
    const head = commitPushStaged(repo, trustedRemotes.workspace.origin, "main", commitPushOptions(), (...args) => pushes.push(args));
    assert.equal(pushes.length, 1);
    assert.deepEqual(pushes[0], [repo, trustedRemotes.workspace.origin, "main", head]);
    assert.equal(f.git(["rev-parse", `${head}^{tree}`]), stagedTree);
    assert.equal(f.git(["rev-parse", `${head}^`]), parent);
    assert.equal(f.git(["log", "-1", "--format=%B"]), defaultCommitMessage);
    assert.equal(f.git(["show", `${head}:reviewed.txt`]), "deliberately staged");
    assert.equal(f.git(["ls-tree", "-r", "--name-only", head]), "reviewed.txt");
    assert.equal(readFileSync(join(directory, "reviewed.txt"), "utf8"), "later unstaged work\n");
    assert.equal(readFileSync(join(directory, ".env"), "utf8"), "SYNTHETIC=placeholder\n");
  } finally { f.dispose(); }
});

test("empty deliberate staging is a successful no-op without a commit or push", () => {
  const f = fixture();
  try {
    const parent = f.initialCommit();
    const repo = { name: "synthetic", gitDir: f.gitDir };
    writeFileSync(join(f.directory, "repo", "reviewed.txt"), "unstaged change\n");
    let pushes = 0;
    assert.equal(commitPushStaged(repo, trustedRemotes.workspace.origin, "main", commitPushOptions(), () => pushes++), null);
    assert.equal(pushes, 0);
    assert.equal(f.git(["rev-parse", "HEAD"]), parent);
    assert.equal(f.git(["rev-list", "--count", "HEAD"]), "1");
    const tree = f.git(["write-tree"]);
    assert.equal(commitPushStaged(repo, trustedRemotes.workspace.origin, "main", commitPushOptions([tree, "Unused explicit message"]), () => pushes++), null);
    assert.equal(pushes, 0);
    assert.throws(() => stagedCommitSnapshot(repo, "main", commitPushOptions(["b".repeat(40)])), /no longer matches/);
  } finally { f.dispose(); }
});

test("explicit whole-workspace commit includes root edits, additions and deletions while honoring ignores", () => {
  const f = fixture();
  try {
    const parent = f.initialCommit();
    const repo = { name: "synthetic", gitDir: f.gitDir };
    const directory = join(f.directory, "repo");
    writeFileSync(join(directory, ".gitignore"), ".env\n__pycache__/\n");
    writeFileSync(join(directory, "package.json"), '{"scripts":{}}\n');
    mkdirSync(join(directory, "docs"));
    writeFileSync(join(directory, "docs", "review.md"), "Reviewed workspace documentation\n");
    mkdirSync(join(directory, "tsn-protocol"));
    writeFileSync(join(directory, "tsn-protocol", "new.ts"), "export const value = 1;\n");
    writeFileSync(join(directory, ".env"), "SYNTHETIC=ignored\n");
    mkdirSync(join(directory, "__pycache__"));
    writeFileSync(join(directory, "__pycache__", "ignored.pyc"), "synthetic cache");
    rmSync(join(directory, "reviewed.txt"));
    let pushed;
    const head = commitPushAll(repo, trustedRemotes.workspace.origin, "main", commitPushOptions(), (...args) => { pushed = args; });
    assert.deepEqual(pushed, [repo, trustedRemotes.workspace.origin, "main", head]);
    assert.equal(f.git(["rev-parse", `${head}^`]), parent);
    assert.deepEqual(f.git(["ls-tree", "-r", "--name-only", head]).split("\n"), [".gitignore", "docs/review.md", "package.json", "tsn-protocol/new.ts"]);
    assert.equal(f.git(["diff", "--cached", "--name-only"]), "");
    assert.equal(readFileSync(join(directory, ".env"), "utf8"), "SYNTHETIC=ignored\n");
  } finally { f.dispose(); }
});

test("whole-workspace retry pushes the same saved commit after a failed push without a duplicate commit", () => {
  const f = fixture();
  try {
    f.initialCommit();
    const repo = { name: "synthetic", gitDir: f.gitDir };
    writeFileSync(join(f.directory, "repo", "reviewed.txt"), "updated workspace\n");
    let failedHead;
    assert.throws(() => commitPushAll(repo, trustedRemotes.workspace.origin, "main", commitPushOptions(), (_repo, _url, _branch, head) => {
      failedHead = head;
      throw new Error("Synthetic push failure");
    }), /Synthetic push failure/);
    const count = f.git(["rev-list", "--count", "HEAD"]);
    let retried;
    assert.equal(commitPushAll(repo, trustedRemotes.workspace.origin, "main", commitPushOptions(), (_repo, _url, _branch, head) => { retried = head; }), failedHead);
    assert.equal(retried, failedHead);
    assert.equal(f.git(["rev-list", "--count", "HEAD"]), count);
  } finally { f.dispose(); }
});

test("explicit tree and message overrides keep exact tree and parent checks", () => {
  const f = fixture();
  try {
    const parent = f.initialCommit();
    const repo = { name: "synthetic", gitDir: f.gitDir };
    writeFileSync(join(f.directory, "repo", "reviewed.txt"), "explicit staging\n");
    f.git(["add", "--", "reviewed.txt"]);
    const tree = f.git(["write-tree"]);
    assert.throws(() => stagedCommitSnapshot(repo, "main", commitPushOptions(["b".repeat(40)])), /no longer matches/);
    assert.equal(f.git(["rev-parse", "HEAD"]), parent);
    const head = commitPushStaged(repo, trustedRemotes.workspace.origin, "main", commitPushOptions([tree, "Explicit reviewed message"]), () => {});
    assert.equal(f.git(["rev-parse", `${head}^{tree}`]), tree);
    assert.equal(f.git(["rev-parse", `${head}^`]), parent);
    assert.equal(f.git(["log", "-1", "--format=%B"]), "Explicit reviewed message");
  } finally { f.dispose(); }
});

test("later index edits cannot change the captured commit and remain staged afterwards", () => {
  const f = fixture();
  try {
    f.initialCommit();
    const repo = { name: "synthetic", gitDir: f.gitDir };
    writeFileSync(join(f.directory, "repo", "reviewed.txt"), "captured staging\n");
    f.git(["add", "--", "reviewed.txt"]);
    const snapshot = stagedCommitSnapshot(repo, "main");
    assert.ok(Object.isFrozen(snapshot));
    writeFileSync(join(f.directory, "repo", "later.txt"), "later staged work\n");
    f.git(["add", "--", "later.txt"]);
    const laterTree = f.git(["write-tree"]);
    const head = commitStagedSnapshot(repo, "main", snapshot);
    assert.equal(f.git(["rev-parse", `${head}^{tree}`]), snapshot.tree);
    assert.equal(f.git(["write-tree"]), laterTree);
    assert.equal(f.git(["diff", "--cached", "--name-only"]), "later.txt");
  } finally { f.dispose(); }
});

test("a branch change after the snapshot prevents the captured commit from replacing it", () => {
  const f = fixture();
  try {
    const parent = f.initialCommit();
    const repo = { name: "synthetic", gitDir: f.gitDir };
    writeFileSync(join(f.directory, "repo", "reviewed.txt"), "captured staging\n");
    f.git(["add", "--", "reviewed.txt"]);
    const snapshot = stagedCommitSnapshot(repo, "main");
    const concurrentHead = f.git(["-c", "commit.gpgSign=false", "commit-tree", snapshot.parentTree, "-p", parent, "-m", "Synthetic concurrent change"]);
    f.git(["update-ref", "refs/heads/main", concurrentHead, parent]);
    assert.throws(() => commitStagedSnapshot(repo, "main", snapshot), /no longer matches/);
    assert.equal(f.git(["rev-parse", "HEAD"]), concurrentHead);
    assert.equal(f.git(["write-tree"]), snapshot.tree);
    assert.throws(() => stagedCommitSnapshot(repo, "different-branch"), /checked-out branch/);
  } finally { f.dispose(); }
});

test("captured private-state trees fail before creating a commit or calling push", () => {
  const f = fixture();
  try {
    const parent = f.initialCommit();
    const repo = { name: "synthetic", gitDir: f.gitDir };
    writeFileSync(join(f.directory, "repo", ".receiver-store.json"), "{}\n");
    f.git(["add", "--", ".receiver-store.json"]);
    let pushes = 0;
    assert.throws(() => commitPushStaged(repo, trustedRemotes.workspace.origin, "main", commitPushOptions(), () => pushes++), /private configuration\/state filename/);
    assert.equal(pushes, 0);
    assert.equal(f.git(["rev-parse", "HEAD"]), parent);
  } finally { f.dispose(); }
});

test("push uses Windows Credential Manager storage with credential tracing disabled", () => {
  const source = readFileSync(join(workspace, "tsn-protocol", "scripts", "repo-security.mjs"), "utf8");
  assert.match(source, /GCM_CREDENTIAL_STORE: "wincredman"/);
  assert.doesNotMatch(source, /GCM_CREDENTIAL_STORE: "(?:wincred|plaintext)"/);
  assert.match(source, /GCM_INTERACTIVE: "Never"/);
  assert.match(source, /GCM_TRACE: "false", GCM_TRACE_SECRETS: "false"/);
});

test("the quoted absolute Windows credential helper is invoked without Git name mangling", { skip: process.platform !== "win32" }, () => {
  const f = fixture();
  try {
    const args = pushArguments(f.gitDir, trustedRemotes.workspace.origin, "main", "a".repeat(40));
    const prefix = args.slice(0, args.indexOf("push"));
    const helper = 'credential.helper=!"C:/Program Files/Git/mingw64/bin/git-credential-manager.exe"';
    assert.ok(prefix.includes(helper));
    const env = { ...gitEnvironment(), LC_ALL: "C", GCM_INTERACTIVE: "Never", GCM_CREDENTIAL_STORE: "wincredman", GCM_TRACE: "false", GCM_TRACE_SECRETS: "false" };
    function probe(probePrefix) {
      // An unsupported protocol and reserved invalid hostname cannot request real credentials.
      // No network command is executed and captured diagnostics are never printed.
      const result = spawnSync(gitExecutable, [...probePrefix, "credential", "fill"], {
        input: "protocol=invalid\nhost=example.invalid\n\n", env, encoding: "utf8", windowsHide: true, timeout: 15000,
      });
      assert.equal(Boolean(result.error), false, "The offline helper probe must complete.");
      assert.notEqual(result.status, 0, "Dummy input must not authenticate.");
      assert.equal(result.stdout.length, 0, "Dummy input must not return credentials.");
      return /not a git command/i.test(result.stderr);
    }
    assert.equal(probe(prefix.map(arg => arg === helper ? helper.replace("helper=!", "helper=") : arg)), true, "The historical quoted path must reproduce the helper-name error.");
    assert.equal(probe(prefix), false, "The fixed absolute command must avoid helper-name errors.");
  } finally { f.dispose(); }
});

test("shared helper checks standalone root and protocol clone layouts without a nested Git boundary", () => {
  for (const kind of ["workspace", "protocol"]) {
    const f = fixture();
    try {
      f.config("remote.origin.url", trustedRemotes[kind].origin);
      hardenRepository(f.gitDir, join(f.directory, "before.config"));
      const scriptDirectory = kind === "workspace" ? join(f.directory, "repo", "tsn-protocol", "scripts") : join(f.directory, "repo", "scripts");
      mkdirSync(scriptDirectory, { recursive: true });
      const script = join(scriptDirectory, "repo-security.mjs");
      copyFileSync(join(workspace, "tsn-protocol", "scripts", "repo-security.mjs"), script);
      const result = spawnSync(process.execPath, [script, "check"], { encoding: "utf8", env: gitEnvironment(), windowsHide: true, timeout: 15000 });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /verified in 1 project Git configurations/);
    } finally { f.dispose(); }
  }
});

test("deleting a private filename from the index cannot make an older reviewed tree safe to push", () => {
  const f = fixture();
  try {
    const repo = join(f.directory, "repo");
    writeFileSync(join(repo, ".receiver-store.json"), "{}\n");
    let result = spawnSync("git", ["-C", repo, "add", "--", ".receiver-store.json"], { env: gitEnvironment(), encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0);
    result = spawnSync("git", ["-C", repo, "write-tree"], { env: gitEnvironment(), encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0);
    const oldTree = result.stdout.trim();
    result = spawnSync("git", ["-C", repo, "update-index", "--force-remove", "--", ".receiver-store.json"], { env: gitEnvironment(), encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0);
    checkPrivateTracking(f.gitDir);
    assert.throws(() => checkPrivateTracking(f.gitDir, oldTree), /private configuration\/state filename/);
  } finally { f.dispose(); }
});
