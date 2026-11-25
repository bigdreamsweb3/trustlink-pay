import { spawnSync } from "node:child_process";
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const protocolRoot = fileURLToPath(new URL("../", import.meta.url));
const parentRoot = fileURLToPath(new URL("../../", import.meta.url));
const compositeCheckout = existsSync(join(parentRoot, ".git", "config"));
export const workspace = compositeCheckout ? parentRoot : protocolRoot;
// This Windows checkout uses the independently signature-verified Git installation.
// Other Windows installations must be reviewed before changing this path.
export const gitExecutable = process.platform === "win32" ? "C:\\Program Files\\Git\\cmd\\git.exe" : "git";
export const trustedRemotes = Object.freeze({
  workspace: Object.freeze({ origin: "https://github.com/bigdreamsweb3/trustlink-pay.git", "tsn-protocol": "https://github.com/Trustlink-Labs/TSN-Protocol.git" }),
  protocol: Object.freeze({ origin: "https://github.com/Trustlink-Labs/TSN-Protocol.git" }),
  "pitch-deck": Object.freeze({ origin: "https://github.com/Trustlink-Labs/TSN-Pitch-Deck.git" }),
});

export function gitEnvironment(source = process.env) {
  // Do not inherit overrides for Git configuration, repositories, executable helpers, or templates.
  return { ...Object.fromEntries(Object.entries(source).filter(([key]) => !/^(?:GIT|GCM)_/.test(key.toUpperCase()))), GIT_TERMINAL_PROMPT: "0" };
}

export function gitFailureMessage(result, operation) {
  // Match diagnostics privately and return only fixed categories, never their values.
  const diagnostics = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  const code = result.error?.code;
  const reason = code === "ETIMEDOUT" && operation === "Approved push" ? "Git exceeded the push time limit while packing or uploading. The local commit is retained; retry git:push:current or increase TRUSTLINK_GIT_PUSH_TIMEOUT_MS."
    : code === "ETIMEDOUT" ? "Git timed out; another task or a slow filesystem may be delaying it."
    : code === "ENOBUFS" ? "Git output exceeded the capture buffer."
    : code === "ENOENT" ? "The configured Git executable is unavailable."
    : /(?:index|config|packed-refs|HEAD|refs[^\n]*)\.lock[^\n]*(?:File exists|already exists)|another git process/i.test(diagnostics) ? "Another Git operation holds a repository lock; let it finish before retrying."
    : code === "ENOSPC" || /no space left|disk full|not enough space/i.test(diagnostics) ? "Git could not write because the disk is full."
    : code === "EACCES" || code === "EPERM" || /permission denied|access is denied/i.test(diagnostics) ? "Git could not access a required file; check filesystem permissions."
    : /does not have a commit checked out/i.test(diagnostics) ? "An embedded repository has no checked-out commit and cannot be staged."
    : /filename too long|invalid path/i.test(diagnostics) ? "A workspace path is unsupported by this Git installation."
    : /non-fast-forward|fetch first|\[rejected\]/i.test(diagnostics) ? "Remote branch requires reconciliation; force push is disabled."
    : /authentication|credential|logon|could not read Username|\b403\b|\b401\b/i.test(diagnostics) ? "GitHub authentication or repository permission is unavailable."
    : /could not resolve host|failed to connect|unable to access|connection timed out/i.test(diagnostics) ? "Git could not connect to the approved destination."
    : "Git returned an unclassified failure.";
  return `${operation} failed. ${reason} Potentially sensitive Git diagnostics were withheld.`;
}

function git(gitDir, args) {
  // Retained submodule metadata can point to an old, missing worktree. Config-only
  // operations use an existing directory without changing its core.worktree setting.
  const result = spawnSync(gitExecutable, ["--git-dir", gitDir, "--work-tree", gitDir, ...args], {
    env: gitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 30000,
  });
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    // Git diagnostics can contain credential-bearing values.
    throw new Error(gitFailureMessage(result, `Git ${args[0]}`));
  }
  return result;
}

export function configuration(gitDir) {
  const result = git(gitDir, ["config", "--null", "--list", "--includes"]);
  if (result.status !== 0) throw new Error("Cannot inspect Git configuration.");
  const values = new Map();
  for (const record of result.stdout.split("\0").filter(Boolean)) {
    const split = record.indexOf("\n");
    const key = normalizeKey(split < 0 ? record : record.slice(0, split));
    const value = split < 0 ? "" : record.slice(split + 1);
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  return values;
}

export function normalizeKey(key) {
  // Sections and variable names are insensitive; subsection names are sensitive.
  const first = key.indexOf(".");
  const final = key.lastIndexOf(".");
  if (first === final) return key.toLowerCase();
  return key.slice(0, first).toLowerCase() + key.slice(first, final) + key.slice(final).toLowerCase();
}

export function validateRemote(config, repoName, remoteName, branch) {
  if (!Object.hasOwn(trustedRemotes, repoName) || !Object.hasOwn(trustedRemotes[repoName], remoteName)) throw new Error("Repository or remote is outside the approved source list.");
  const expected = trustedRemotes[repoName][remoteName];
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(branch) || branch.includes("..") || branch.includes("//") || branch.endsWith("/") || branch.endsWith(".lock")) throw new Error("Use an explicit ordinary branch name.");
  for (const key of config.keys()) {
    if (key.startsWith("url.") && /\.(?:insteadof|pushinsteadof)$/.test(key)) throw new Error("Git URL rewrites must be reviewed before fetching.");
  }
  const urls = config.get(`remote.${remoteName}.url`) ?? [];
  if (urls.length !== 1 || urls[0] !== expected) throw new Error("Configured source does not exactly match the approved repository.");
  if ((config.get(`remote.${remoteName}.pushurl`) ?? []).some(url => url !== expected)) throw new Error("An unexpected push destination is configured.");
  return expected;
}

const requiredSettings = Object.freeze({
  "core.fsmonitor": "false", "protocol.allow": "never", "protocol.https.allow": "never",
  "fetch.recurseSubmodules": "false", "submodule.recurse": "false", "push.recurseSubmodules": "no", "push.default": "nothing",
  "fetch.fsckObjects": "true", "receive.fsckObjects": "true", "transfer.fsckObjects": "true", "http.sslVerify": "true", "http.followRedirects": "false",
});
const knownProtocols = ["file", "git", "ssh", "http", "https", "ext", "ftp", "ftps", "rsync"];
function last(config, key) { return config.get(normalizeKey(key))?.at(-1); }

export function checkRepository(gitDir, repoName) {
  const config = configuration(gitDir);
  for (const [key, expected] of Object.entries(requiredSettings)) {
    if (last(config, key) !== expected) throw new Error(`Required Git protection is missing: ${key}`);
  }
  for (const [key, values] of config) {
    if (/^protocol\..+\.allow$/.test(key) && values.at(-1) !== "never") throw new Error("A Git transport is enabled outside the reviewed helper.");
    if (/^submodule\..+\.active$/.test(key) && values.at(-1) !== "false") throw new Error("An external submodule is active.");
    if (/^submodule\..+\.update$/.test(key) && values.at(-1) !== "none") throw new Error("An external submodule update is enabled.");
    if (key.startsWith("url.") && /\.(?:insteadof|pushinsteadof)$/.test(key)) throw new Error("A Git URL rewrite is configured.");
    if (key.startsWith("http.") && key.endsWith(".sslverify") && values.at(-1) !== "true") throw new Error("A URL-specific TLS exception is configured.");
    if (key.startsWith("http.") && key.endsWith(".followredirects") && values.at(-1) !== "false") throw new Error("A URL-specific redirect exception is configured.");
  }
  const hooks = join(gitDir, "trustlink-disabled-hooks");
  if (last(config, "core.hooksPath") !== hooks || !existsSync(hooks) || lstatSync(hooks).isSymbolicLink() || !lstatSync(hooks).isDirectory() || readdirSync(hooks).length) throw new Error("The disabled hooks directory is missing, redirected, or contains files.");
  if (repoName) {
    const remotes = trustedRemotes[repoName];
    for (const remote of Object.keys(remotes)) {
      if (remote === "origin" || config.has(`remote.${remote}.url`)) validateRemote(config, repoName, remote, "main");
    }
    for (const key of config.keys()) {
      const match = /^remote\.(.+)\.url$/.exec(key);
      if (match && !Object.hasOwn(remotes, match[1])) throw new Error("An additional Git remote needs review.");
    }
  }
  return config;
}

export function checkPrivateTracking(gitDir, object) {
  if (object !== undefined) requireReviewedHash(object, object, "object");
  const result = git(gitDir, object ? ["ls-tree", "-r", "--name-only", "-z", object] : ["ls-files", "-z"]);
  if (result.status !== 0) throw new Error("Cannot inspect tracked private-state filenames.");
  const publicDefaults = new Set(["protocol-tests/tcap-credit-devnet.defaults.env", "tsn-protocol/protocol-tests/tcap-credit-devnet.defaults.env"]);
  const privateDirectories = /(?:^|\/)(?:private|private-state|secrets|\.secrets|credentials|\.credentials|\.creds|\.creds_example|\.fb_creds|\.keys|\.node-cache)(?:\/|$)/i;
  const privateNames = /(?:^|\/)(?:\.env(?:\..*)?|[^/]+\.env(?:\..*)?|\.dev\.vars(?:\..*)?|.*keypair.*\.json|.*\.service-account\.json|.*firebase-adminsdk.*\.json|\.receiver-store[^/]*|\.mempool-store[^/]*|operator-state[^/]*\.json|receiver-export[^/]*\.json|wrangler\.toml|[^/]*\.(?:pem|key|p12|pfx|import\.sql|export\.sql|sqlite|sqlite3|db))$/i;
  for (const path of result.stdout.split("\0").filter(Boolean)) {
    if (privateDirectories.test(path)) throw new Error("A private configuration/state filename is tracked; review without logging its contents.");
    if (publicDefaults.has(path) || /(?:^|\/)\.env\.(?:example|sample|template)$/.test(path)) continue;
    if (privateNames.test(path) || /(?:^|\/)keys\/(?!\.gitkeep$).*\.json$/i.test(path)) throw new Error("A private configuration/state filename is tracked; review without logging its contents.");
  }
}

export function hardenRepository(gitDir, backupPath) {
  const source = join(gitDir, "config");
  if (!lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) throw new Error("Git configuration must be a regular file.");
  copyFileSync(source, backupPath, constants.COPYFILE_EXCL);
  const config = configuration(gitDir);
  const hooks = join(gitDir, "trustlink-disabled-hooks");
  if (existsSync(hooks) && (lstatSync(hooks).isSymbolicLink() || !lstatSync(hooks).isDirectory() || readdirSync(hooks).length)) throw new Error("Refusing to alter a populated hooks directory.");
  mkdirSync(hooks, { recursive: true });
  const settings = { ...requiredSettings, "core.hooksPath": hooks };
  for (const protocol of knownProtocols) settings[`protocol.${protocol}.allow`] = "never";
  for (const key of config.keys()) {
    if (/^protocol\..+\.allow$/.test(key)) settings[key] = "never";
    const submodule = /^submodule\.(.+)\.(?:active|url|update)$/.exec(key);
    if (submodule) { settings[`submodule.${submodule[1]}.active`] = "false"; settings[`submodule.${submodule[1]}.update`] = "none"; }
    if (key.startsWith("http.") && key.endsWith(".sslverify")) settings[key] = "true";
    if (key.startsWith("http.") && key.endsWith(".followredirects")) settings[key] = "false";
  }
  for (const [key, value] of Object.entries(settings)) {
    if (git(gitDir, ["config", "--local", "--replace-all", key, value]).status !== 0) throw new Error(`Cannot apply Git protection: ${key}`);
  }
}

export function repositories(root = workspace) {
  const entries = compositeCheckout ? [ { name: "workspace", gitDir: join(root, ".git") } ] : [ { name: "protocol", gitDir: join(root, ".git") } ];
  if (compositeCheckout && existsSync(join(root, "tsn-protocol", ".git", "config"))) entries.push({ name: "protocol", gitDir: join(root, "tsn-protocol", ".git") });
  // The deck has its own explicitly approved destination. Research remains
  // local-only; preserve its files/remotes while denying its transports.
  for (const [name, path] of [["pitch-deck", "pitch-deck"], ["research", "research/Trustlink-Research"]]) {
    const gitDir = join(root, path, ".git");
    if (existsSync(join(gitDir, "config"))) entries.push({ name, gitDir });
  }
  function visit(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const child = join(directory, entry.name);
      if (existsSync(join(child, "config"))) entries.push({ name: `stored-submodule-${entries.length - 1}`, gitDir: child });
      visit(child);
    }
  }
  visit(join(root, ".git", "modules"));
  for (const repo of entries) {
    if (!existsSync(join(repo.gitDir, "config")) || lstatSync(repo.gitDir).isSymbolicLink()) throw new Error("Expected project Git boundary is missing or redirected.");
    repo.gitDir = realpathSync(repo.gitDir);
  }
  return entries;
}

export function fetchArguments(gitDir, url, remote, branch) {
  return ["--git-dir", gitDir, "-c", "core.fsmonitor=false", "-c", `core.hooksPath=${join(gitDir, "trustlink-disabled-hooks")}`,
    "-c", "protocol.allow=never", "-c", "protocol.https.allow=always", "-c", "http.sslVerify=true", "-c", "http.followRedirects=false", "-c", `http.${url}.followRedirects=false`,
    "-c", "credential.helper=", "-c", "core.askPass=", "-c", "fetch.fsckObjects=true",
    "fetch", "--no-recurse-submodules", "--no-tags", "--no-auto-maintenance", "--refmap=", "--", url, `refs/heads/${branch}:refs/remotes/${remote}/${branch}`];
}

export function requireReviewedHash(expected, actual, kind = "commit") {
  if (typeof expected !== "string" || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(expected)) throw new Error(`Pass the full reviewed ${kind} hash; inspect the intended snapshot first.`);
  if (expected !== actual) throw new Error(`The reviewed ${kind} no longer matches; inspect the changes again.`);
}

export const defaultCommitMessage = "Update staged project changes";

export function commitPushOptions(overrides = []) {
  if (overrides.length > 2) throw new Error("Commit/push accepts an optional full staged-tree hash and commit message.");
  const [reviewedTree, suppliedMessage] = overrides;
  if (reviewedTree !== undefined) requireReviewedHash(reviewedTree, reviewedTree, "staged tree");
  const message = suppliedMessage ?? defaultCommitMessage;
  if (typeof message !== "string" || !message.trim() || message.includes("\0")) throw new Error("Use a nonempty commit message without null characters.");
  return Object.freeze({ reviewedTree, message });
}

export function stagedCommitSnapshot(repo, branch, options = commitPushOptions()) {
  const parent = currentHead(repo, branch);
  requireReviewedHash(parent, parent);
  const parentTree = git(repo.gitDir, ["rev-parse", `${parent}^{tree}`]);
  if (parentTree.status !== 0) throw new Error("Cannot identify the parent commit tree.");
  const tree = git(repo.gitDir, ["write-tree"]);
  if (tree.status !== 0) throw new Error("Staged changes could not form a captured tree.");
  const capturedTree = tree.stdout.trim();
  const capturedParentTree = parentTree.stdout.trim();
  requireReviewedHash(capturedTree, capturedTree, "staged tree");
  requireReviewedHash(capturedParentTree, capturedParentTree, "parent tree");
  if (options.reviewedTree !== undefined) requireReviewedHash(options.reviewedTree, capturedTree, "staged tree");
  checkPrivateTracking(repo.gitDir, capturedTree);
  return Object.freeze({ parent, parentTree: capturedParentTree, tree: capturedTree, message: options.message });
}

export function commitStagedSnapshot(repo, branch, snapshot) {
  requireReviewedHash(snapshot.parent, currentHead(repo, branch));
  if (snapshot.tree === snapshot.parentTree) return null;
  checkPrivateTracking(repo.gitDir, snapshot.tree);
  const result = spawnSync(gitExecutable, ["--git-dir", repo.gitDir, "--work-tree", resolve(repo.gitDir, ".."),
    "-c", `core.hooksPath=${join(repo.gitDir, "trustlink-disabled-hooks")}`, "-c", "core.fsmonitor=false", "-c", "commit.gpgSign=false",
    "commit-tree", snapshot.tree, "-p", snapshot.parent, "-m", snapshot.message], { env: gitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error(gitFailureMessage(result, "Captured commit"));
  const head = result.stdout.trim();
  requireReviewedHash(head, head);
  requireReviewedHash(snapshot.parent, currentHead(repo, branch));
  const updated = git(repo.gitDir, ["update-ref", "-m", "commit: staged changes", `refs/heads/${branch}`, head, snapshot.parent]);
  if (updated.status !== 0) throw new Error("Branch changed during commit; prepared commit was retained but nothing was pushed.");
  return head;
}

export function commitPushStaged(repo, url, branch, options = commitPushOptions(), push = pushReviewed) {
  const snapshot = stagedCommitSnapshot(repo, branch, options);
  const head = commitStagedSnapshot(repo, branch, snapshot);
  if (head === null) {
    console.log("No staged changes; nothing committed or pushed.");
    return null;
  }
  console.log(`Created captured ${repo.name} commit ${head}.`);
  push(repo, url, branch, head);
  return head;
}

export function stageAllChanges(repo, branch) {
  currentHead(repo, branch);
  checkPrivateTracking(repo.gitDir);
  const root = resolve(repo.gitDir, "..");
  const result = spawnSync(gitExecutable, ["--git-dir", repo.gitDir, "--work-tree", root,
    "-c", `core.hooksPath=${join(repo.gitDir, "trustlink-disabled-hooks")}`, "-c", "core.fsmonitor=false",
    "add", "--all", "--", "."], { cwd: root, env: gitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error(gitFailureMessage(result, "Workspace staging"));
  checkPrivateTracking(repo.gitDir);
}

export function commitPushAll(repo, url, branch, options = commitPushOptions(), push = pushReviewed) {
  stageAllChanges(repo, branch);
  const snapshot = stagedCommitSnapshot(repo, branch, options);
  const created = commitStagedSnapshot(repo, branch, snapshot);
  const head = created ?? snapshot.parent;
  console.log(created ? `Created captured ${repo.name} commit ${head}.`
    : `No new workspace changes; retrying the existing ${repo.name} commit ${head}.`);
  push(repo, url, branch, head);
  return head;
}

export function pushArguments(gitDir, url, branch, reviewedHead) {
  const args = fetchArguments(gitDir, url, "unused", branch);
  const prefix = args.slice(0, args.indexOf("fetch"));
  if (process.platform === "win32") {
    // Git requires the explicit command marker to preserve a quoted absolute path.
    // This command is fixed; no repository or user value enters the shell string.
    prefix.push("-c", 'credential.helper=!"C:/Program Files/Git/mingw64/bin/git-credential-manager.exe"');
  }
  return [...prefix, "-c", "push.followTags=false", "-c", "push.recurseSubmodules=no", "push", "--porcelain", "--no-follow-tags", "--no-verify", "--", url, `${reviewedHead}:refs/heads/${branch}`];
}

function approvedRepository(repoName, remoteName, branch) {
  const repo = repositories().find(entry => entry.name === repoName);
  if (!repo || !Object.hasOwn(trustedRemotes, repoName)) throw new Error("Select an available workspace, protocol or pitch-deck repository explicitly.");
  const config = checkRepository(repo.gitDir, repoName);
  checkPrivateTracking(repo.gitDir);
  const url = validateRemote(config, repoName, remoteName, branch);
  return { repo: { ...repo, remoteName }, url };
}

function currentHead(repo, branch) {
  const selected = git(repo.gitDir, ["symbolic-ref", "--short", "HEAD"]);
  if (selected.status !== 0 || selected.stdout.trim() !== branch) throw new Error("The checked-out branch must match the explicitly selected push branch.");
  const head = git(repo.gitDir, ["rev-parse", "HEAD"]);
  if (head.status !== 0) throw new Error("Cannot identify the reviewed commit.");
  return head.stdout.trim();
}

export function pushCurrent(repo, url, branch, push = pushReviewed) {
  const head = currentHead(repo, branch);
  requireReviewedHash(head, head);
  checkPrivateTracking(repo.gitDir, head);
  console.log(`Captured current ${repo.name} commit ${head}; staged and unstaged changes are excluded.`);
  push(repo, url, branch, head);
  return head;
}

export function pushTimeoutMilliseconds(source = process.env) {
  const value = source.TRUSTLINK_GIT_PUSH_TIMEOUT_MS;
  if (value === undefined) return 900000;
  if (!/^\d+$/.test(value) || Number(value) < 30000 || Number(value) > 3600000) {
    throw new Error("TRUSTLINK_GIT_PUSH_TIMEOUT_MS must be an integer from 30000 to 3600000 milliseconds.");
  }
  return Number(value);
}

export function pushReviewed(repo, url, branch, expectedHead, run = spawnSync, source = process.env) {
  const timeout = pushTimeoutMilliseconds(source);
  // Only fixed approved URLs may be printed; never echo credential-bearing input.
  if (!Object.values(trustedRemotes).some(remotes => Object.values(remotes).includes(url))) {
    throw new Error("Push destination is outside the approved source list.");
  }
  const repositoryUrl = url.replace(/\.git$/, "");
  requireReviewedHash(expectedHead, currentHead(repo, branch));
  checkPrivateTracking(repo.gitDir, expectedHead);
  console.log(`Pushing captured ${repo.name} commit ${expectedHead}; packing and upload have a ${timeout / 1000}-second time limit.`);
  const result = run(gitExecutable, pushArguments(repo.gitDir, url, branch, expectedHead), {
    env: { ...gitEnvironment(source), GCM_INTERACTIVE: "Never", GCM_CREDENTIAL_STORE: "wincredman", GCM_TRACE: "false", GCM_TRACE_SECRETS: "false" }, encoding: "utf8", windowsHide: true, timeout,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${gitFailureMessage(result, "Approved push")}\nRepository: ${repositoryUrl}`);
  }
  // A URL-based push does not refresh origin/main as a named-remote push would.
  // Record the accepted commit locally so Git's ahead/behind display is accurate.
  try {
    const remoteName = repo.remoteName ?? "origin";
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(remoteName)) throw new Error("Invalid tracking remote.");
    const ref = `refs/remotes/${remoteName}/${branch}`;
    const previous = git(repo.gitDir, ["rev-parse", "--verify", "--quiet", ref]);
    const previousHead = previous.stdout.trim() || "0".repeat(expectedHead.length);
    const updated = git(repo.gitDir, ["update-ref", ref, expectedHead, previousHead]);
    if (updated.status !== 0) throw new Error("Tracking ref changed concurrently.");
  } catch {
    console.warn("Remote push succeeded, but the local remote-tracking ref could not be refreshed; its ahead/behind display may be stale.");
  }
  console.log(`Pushed reviewed ${repo.name} commit ${expectedHead} to the approved ${branch} branch.`);
  console.log(`Repository: ${repositoryUrl}`);
  console.log(`Branch: ${repositoryUrl}/tree/${encodeURIComponent(branch)}`);
  console.log(`Commit: ${repositoryUrl}/commit/${expectedHead}`);
}

export function main(args) {
  const [command, repoName, remoteName, branch] = args;
  // Reject an invalid timeout before a commit-all command stages or commits work.
  if (["push", "push-current", "commit-push", "commit-push-all"].includes(command)) pushTimeoutMilliseconds();
  if (command === "check" && args.length === 1) {
    const entries = repositories();
    for (const repo of entries) {
      checkRepository(repo.gitDir, Object.hasOwn(trustedRemotes, repo.name) ? repo.name : undefined);
      if (Object.hasOwn(trustedRemotes, repo.name)) checkPrivateTracking(repo.gitDir);
    }
    console.log(`Git protections verified in ${entries.length} project Git configurations; approved sources match. No network operation performed.`);
    return;
  }
  if (command === "harden" && args.length === 1) {
    const entries = repositories();
    const backup = join(tmpdir(), `trustlink-git-hardening-${Date.now()}`);
    mkdirSync(backup);
    writeFileSync(join(backup, "map.json"), JSON.stringify(entries.map((repo, index) => ({ gitDir: repo.gitDir, backup: `${index}.config` })), null, 2));
    for (const [index, repo] of entries.entries()) hardenRepository(repo.gitDir, join(backup, `${index}.config`));
    for (const repo of entries) checkRepository(repo.gitDir, Object.hasOwn(trustedRemotes, repo.name) ? repo.name : undefined);
    console.log(`Hardened ${entries.length} project Git configurations. Private configuration backups: ${backup}`);
    return;
  }
  if (command === "fetch" && args.length === 4) {
    const { repo, url } = approvedRepository(repoName, remoteName, branch);
    const result = spawnSync(gitExecutable, fetchArguments(repo.gitDir, url, remoteName, branch), { env: gitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 120000 });
    if (result.error || result.status !== 0) throw new Error(gitFailureMessage(result, "Approved fetch"));
    console.log(`Fetched approved ${repoName}/${remoteName} branch into its remote-tracking ref. Review the diff before any checkout or merge.`);
    return;
  }
  if (command === "push") {
    requireReviewedHash(args[4], args[4]);
    if (args.length !== 5) throw new Error("Push requires repository, remote, branch and one full reviewed commit hash.");
    const { repo, url } = approvedRepository(repoName, remoteName, branch);
    pushReviewed(repo, url, branch, args[4]);
    return;
  }
  if (command === "push-current") {
    if (args.length !== 4) throw new Error("Current push requires only an explicit repository, remote and branch.");
    const { repo, url } = approvedRepository(repoName, remoteName, branch);
    pushCurrent(repo, url, branch);
    return;
  }
  if (command === "commit-push" || command === "commit-push-all") {
    if (args.length < 4) throw new Error("Commit/push requires an explicit repository, remote and branch.");
    const options = commitPushOptions(args.slice(4));
    const { repo, url } = approvedRepository(repoName, remoteName, branch);
    if (command === "commit-push-all") commitPushAll(repo, url, branch, options);
    else commitPushStaged(repo, url, branch, options);
    return;
  }
  throw new Error("Usage: node scripts/repo-security.mjs check | harden | fetch <repo> <remote> <branch> | push <repo> <remote> <branch> <reviewed-commit> | push-current <repo> <remote> <branch> | commit-push[-all] <repo> <remote> <branch> [reviewed-staged-tree] [message]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
