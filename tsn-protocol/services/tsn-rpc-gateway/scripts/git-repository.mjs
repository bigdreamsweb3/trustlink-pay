import { spawnSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const gatewayRoot = fileURLToPath(new URL("../", import.meta.url));
export const gatewayUrl = "https://github.com/bigdreamsweb3/tsn-rpc-gateway.git";
const gitExecutable = process.platform === "win32" ? "C:\\Program Files\\Git\\cmd\\git.exe" : "git";

export function gitEnvironment(source = process.env) {
  return { ...Object.fromEntries(Object.entries(source).filter(([key]) => !/^(?:GIT|GCM)_/.test(key.toUpperCase()))), GIT_TERMINAL_PROMPT: "0" };
}

export function pushTimeout(source = process.env) {
  const value = source.TRUSTLINK_GIT_PUSH_TIMEOUT_MS;
  if (value === undefined) return 900000;
  if (!/^\d+$/.test(value) || Number(value) < 30000 || Number(value) > 3600000) throw new Error("TRUSTLINK_GIT_PUSH_TIMEOUT_MS must be an integer from 30000 to 3600000 milliseconds.");
  return Number(value);
}

export function packageDestination(root) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (manifest.repository?.type !== "git" || manifest.repository?.url?.replace(/^git\+/, "") !== gatewayUrl) throw new Error("RPC gateway package.json must name the approved bigdreamsweb3/tsn-rpc-gateway repository.");
  return gatewayUrl;
}

function checked(result, operation) {
  if (result.error || result.status !== 0) {
    const diagnostics = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
    const reason = /index\.lock/i.test(diagnostics) && /File exists|already exists|another git process/i.test(diagnostics)
      ? "Another Git operation holds RPC gateway's index.lock. Let it finish, then retry; do not run simultaneous publication tasks."
      : result.error?.code === "ETIMEDOUT" ? "Git exceeded its time limit; let any active Git operation finish before retrying."
      : /permission denied|access is denied/i.test(diagnostics) ? "Git cannot access a RPC gateway file; check filesystem permissions."
      : /non-fast-forward|fetch first|\[rejected\]/i.test(diagnostics) ? "RPC gateway main requires reconciliation; force push is disabled."
      : "Check authentication, connectivity, filesystem access and branch reconciliation; no force push is available.";
    throw new Error(`${operation} failed. ${reason} Raw Git diagnostics were withheld to protect credentials.`);
  }
  return result.stdout.trim();
}

function git(repo, args, run = spawnSync, options = {}) {
  return run(gitExecutable, ["--git-dir", repo.gitDir, "--work-tree", repo.root,
    "-c", "core.fsmonitor=false", "-c", `core.hooksPath=${repo.hooks}`, "-c", "protocol.allow=never", ...args],
  { cwd: repo.root, env: gitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 120000, ...options });
}

function emptyDirectory(path) {
  if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory() || readdirSync(path).length)) throw new Error("RPC gateway Git hooks/template directory must be empty and must not be redirected.");
  mkdirSync(path, { recursive: true });
}

export function openRepository(root = gatewayRoot) {
  root = realpathSync(root);
  packageDestination(root);
  const probe = spawnSync(gitExecutable, ["-c", "core.fsmonitor=false", "-C", root, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir"],
    { env: gitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 30000 });
  const [top, enclosingGitDir] = checked(probe, "RPC gateway Git boundary inspection").split(/\r?\n/);
  const standalone = realpathSync(top) === root;
  // In a protocol/workspace checkout, keep independent publication metadata in
  // its Git directory, never in RPC gateway source or its enclosing branch/index.
  const gitDir = standalone ? realpathSync(enclosingGitDir) : join(realpathSync(enclosingGitDir), "trustlink-rpc-gateway-publication.git");
  if (existsSync(gitDir) && (lstatSync(gitDir).isSymbolicLink() || !lstatSync(gitDir).isDirectory())) throw new Error("RPC gateway publication Git directory is redirected.");
  const hooks = join(gitDir, "trustlink-disabled-hooks");
  const repo = { root, gitDir, hooks, standalone };
  if (!existsSync(join(gitDir, "config"))) {
    if (standalone) throw new Error("RPC gateway checkout is missing its Git configuration.");
    mkdirSync(gitDir, { recursive: true });
    const template = join(gitDir, "trustlink-empty-template");
    emptyDirectory(template);
    checked(spawnSync(gitExecutable, ["init", "--bare", "--initial-branch=main", `--template=${template}`, gitDir],
      { env: gitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 30000 }), "RPC gateway publication initialization");
    checked(git(repo, ["config", "--local", "remote.origin.url", gatewayUrl]), "RPC gateway destination configuration");
    for (const key of ["user.name", "user.email"]) {
      const value = spawnSync(gitExecutable, ["--git-dir", enclosingGitDir, "config", "--get", key],
        { env: gitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 30000 });
      if (value.status === 0) checked(git(repo, ["config", "--local", key, value.stdout.trim()]), "RPC gateway author configuration");
    }
  }
  emptyDirectory(hooks);
  validateConfiguration(repo);
  return repo;
}

export function validateConfiguration(repo) {
  const records = checked(git(repo, ["config", "--null", "--list", "--includes"]), "RPC gateway Git configuration inspection").split("\0").filter(Boolean);
  const urls = [];
  for (const record of records) {
    const split = record.indexOf("\n");
    const key = record.slice(0, split).toLowerCase();
    const value = record.slice(split + 1);
    if (key.startsWith("url.") && /\.(?:insteadof|pushinsteadof)$/.test(key)) throw new Error("Git URL rewrites must be reviewed before RPC gateway publication.");
    if (key.startsWith("http.") && ((key.endsWith(".sslverify") && value !== "true") || (key.endsWith(".followredirects") && value !== "false"))) throw new Error("Unsafe Git TLS or redirect configuration must be reviewed.");
    if (/^remote\..+\.(?:url|pushurl)$/.test(key)) {
      if (!/^remote\.origin\.(?:url|pushurl)$/.test(key) || value !== gatewayUrl) throw new Error("RPC gateway Git destination must exactly match package.json and the approved RPC gateway repository.");
      if (key === "remote.origin.url") urls.push(value);
    }
  }
  if (urls.length !== 1) throw new Error("RPC gateway requires exactly one approved origin URL.");
}

export function networkArguments(repo, command, hash) {
  const prefix = ["-c", "protocol.https.allow=always", "-c", "http.sslVerify=true", "-c", "http.followRedirects=false",
    "-c", `http.${gatewayUrl}.sslVerify=true`, "-c", `http.${gatewayUrl}.followRedirects=false`,
    "-c", "credential.helper=", "-c", "core.askPass=", "-c", "fetch.fsckObjects=true", "-c", "transfer.fsckObjects=true"];
  if (command === "fetch") return [...prefix, "fetch", "--no-recurse-submodules", "--no-tags", "--no-auto-maintenance", "--refmap=", "--", gatewayUrl, "refs/heads/main:refs/remotes/origin/main"];
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(hash)) throw new Error("RPC gateway push requires its full captured commit hash.");
  if (process.platform === "win32") prefix.push("-c", 'credential.helper=!"C:/Program Files/Git/mingw64/bin/git-credential-manager.exe"');
  return [...prefix, "-c", "push.followTags=false", "-c", "push.recurseSubmodules=no", "push", "--porcelain", "--no-follow-tags", "--no-verify", "--", gatewayUrl, `${hash}:refs/heads/main`];
}

export function fetchGateway(repo, run = spawnSync, allowEmpty = false) {
  const result = git(repo, networkArguments(repo, "fetch"), run);
  // A new destination may have no main yet. Authentication/network failures
  // must never be misclassified as an empty repository.
  if (allowEmpty && !result.error && result.status !== 0 && /couldn't find remote ref refs\/heads\/main/i.test(result.stderr ?? "")) return null;
  checked(result, "RPC gateway fetch");
  return checked(git(repo, ["rev-parse", "refs/remotes/origin/main"]), "RPC gateway fetched commit inspection");
}

export function checkPrivateTree(repo, tree) {
  const paths = checked(git(repo, ["ls-tree", "-r", "--name-only", "-z", tree]), "RPC gateway snapshot inspection").split("\0").filter(Boolean);
  for (const path of paths) {
    if (/(?:^|\/)\.env\.(?:example|sample|template)$/.test(path)) continue;
    if (/(?:^|\/)(?:\.env(?:\..*)?|\.fb_creds|.*[-_]keypair\.json|.*\.service-account\.json|.*firebase-adminsdk.*\.json|\.receiver-store[^/]*)(?:\/|$)/i.test(path)) throw new Error("RPC gateway snapshot contains a private configuration/state filename; nothing was pushed.");
  }
}

export function commitPushGateway(repo, { runNetwork = spawnSync, timeout = pushTimeout(), message = "Update RPC gateway changes" } = {}) {
  if (typeof message !== "string" || !message.trim() || message.includes("\0")) throw new Error("Use a nonempty RPC gateway commit message.");
  packageDestination(repo.root);
  validateConfiguration(repo);
  const lock = join(repo.gitDir, "trustlink-publication.lock");
  let fd;
  try { fd = openSync(lock, "wx"); } catch { throw new Error("Another RPC gateway publication holds its lock; let it finish before retrying."); }
  try {
    if (checked(git(repo, ["symbolic-ref", "HEAD"]), "RPC gateway branch inspection") !== "refs/heads/main") throw new Error("RPC gateway publication requires the existing main branch; branches are never switched automatically.");
    checkPrivateTree(repo, checked(git(repo, ["write-tree"]), "RPC gateway existing index inspection"));
    const head = git(repo, ["rev-parse", "--verify", "--quiet", "HEAD"]);
    let parent = head.status === 0 ? head.stdout.trim() : null;
    if (head.error || ![0, 1].includes(head.status)) checked(head, "RPC gateway parent inspection");
    if (!parent && !repo.standalone) parent = fetchGateway(repo, runNetwork, true);
    checked(git(repo, parent ? ["read-tree", parent] : ["read-tree", "--empty"]), "RPC gateway index preparation");
    checked(git(repo, ["add", "--all", "--", "."]), "RPC gateway staging");
    const tree = checked(git(repo, ["write-tree"]), "RPC gateway tree capture");
    checkPrivateTree(repo, tree);
    const previousTree = parent ? checked(git(repo, ["rev-parse", `${parent}^{tree}`]), "RPC gateway parent tree inspection") : null;
    const commit = tree === previousTree ? parent : checked(git(repo, ["-c", "commit.gpgSign=false", "commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message]), "RPC gateway captured commit");
    // Compare-and-swap preserves concurrent branch changes and failed-push retries.
    checked(git(repo, ["update-ref", "refs/heads/main", commit, head.status === 0 ? head.stdout.trim() : "0".repeat(commit.length)]), "RPC gateway branch update");
    if (checked(git(repo, ["rev-parse", "HEAD"]), "RPC gateway captured HEAD inspection") !== commit) throw new Error("RPC gateway HEAD changed; nothing was pushed.");
    const url = gatewayUrl.replace(/\.git$/, "");
    console.log(`Pushing captured RPC gateway commit ${commit}; only RPC gateway files are included.`);
    const result = git(repo, networkArguments(repo, "push", commit), runNetwork, {
      timeout, env: { ...gitEnvironment(), GCM_INTERACTIVE: "Never", GCM_CREDENTIAL_STORE: "wincredman", GCM_TRACE: "false", GCM_TRACE_SECRETS: "false" },
    });
    try { checked(result, "RPC gateway push"); } catch (error) { throw new Error(`${error.message}\nThe local RPC gateway commit is retained; retry git:commit:push:all.\nRepository: ${url}`); }
    const tracked = git(repo, ["update-ref", "refs/remotes/origin/main", commit]);
    if (tracked.error || tracked.status !== 0) console.warn("RPC gateway push succeeded, but its local tracking ref could not be refreshed.");
    console.log(`Repository: ${url}\nBranch: ${url}/tree/main\nCommit: ${url}/commit/${commit}`);
    return commit;
  } finally { closeSync(fd); unlinkSync(lock); }
}

export function main(args, root = gatewayRoot) {
  const [command, name, remote, branch, message] = args;
  if (!(["fetch", "commit-push-all"].includes(command)) || name !== "gateway" || remote !== "origin" || branch !== "main" || args.length < 4 || args.length > (command === "fetch" ? 4 : 5)) throw new Error("Usage: node scripts/git-repository.mjs <fetch|commit-push-all> gateway origin main [commit-message]");
  const timeout = pushTimeout();
  const repo = openRepository(root);
  if (command === "fetch") {
    fetchGateway(repo);
    console.log("Fetched bigdreamsweb3/tsn-rpc-gateway main into RPC gateway publication metadata; no workspace files or branches were changed.");
  } else commitPushGateway(repo, { timeout, message });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
