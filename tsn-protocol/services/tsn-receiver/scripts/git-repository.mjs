import { spawnSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const receiverRoot = fileURLToPath(new URL("../", import.meta.url));
export const receiverUrl = "https://github.com/bigdreamsweb3/tsn-receiver.git";
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
  if (manifest.repository?.type !== "git" || manifest.repository?.url?.replace(/^git\+/, "") !== receiverUrl) throw new Error("Receiver package.json must name the approved bigdreamsweb3/tsn-receiver repository.");
  return receiverUrl;
}

function checked(result, operation) {
  if (result.error || result.status !== 0) {
    const diagnostics = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
    const reason = /index\.lock/i.test(diagnostics) && /File exists|already exists|another git process/i.test(diagnostics)
      ? "Another Git operation holds Receiver's index.lock. Let it finish, then retry; do not run simultaneous publication tasks."
      : result.error?.code === "ETIMEDOUT" ? "Git exceeded its time limit; let any active Git operation finish before retrying."
      : /permission denied|access is denied/i.test(diagnostics) ? "Git cannot access a Receiver file; check filesystem permissions."
      : /non-fast-forward|fetch first|\[rejected\]/i.test(diagnostics) ? "Receiver main requires reconciliation; force push is disabled."
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
  if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory() || readdirSync(path).length)) throw new Error("Receiver Git hooks/template directory must be empty and must not be redirected.");
  mkdirSync(path, { recursive: true });
}

export function openRepository(root = receiverRoot) {
  root = realpathSync(root);
  packageDestination(root);
  const probe = spawnSync(gitExecutable, ["-c", "core.fsmonitor=false", "-C", root, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir"],
    { env: gitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 30000 });
  const [top, enclosingGitDir] = checked(probe, "Receiver Git boundary inspection").split(/\r?\n/);
  const standalone = realpathSync(top) === root;
  // In a protocol/workspace checkout, keep independent publication metadata in
  // its Git directory, never in Receiver source or its enclosing branch/index.
  const gitDir = standalone ? realpathSync(enclosingGitDir) : join(realpathSync(enclosingGitDir), "trustlink-receiver-publication.git");
  if (existsSync(gitDir) && (lstatSync(gitDir).isSymbolicLink() || !lstatSync(gitDir).isDirectory())) throw new Error("Receiver publication Git directory is redirected.");
  const hooks = join(gitDir, "trustlink-disabled-hooks");
  const repo = { root, gitDir, hooks, standalone };
  if (!existsSync(join(gitDir, "config"))) {
    if (standalone) throw new Error("Receiver checkout is missing its Git configuration.");
    mkdirSync(gitDir, { recursive: true });
    const template = join(gitDir, "trustlink-empty-template");
    emptyDirectory(template);
    checked(spawnSync(gitExecutable, ["init", "--bare", "--initial-branch=main", `--template=${template}`, gitDir],
      { env: gitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 30000 }), "Receiver publication initialization");
    checked(git(repo, ["config", "--local", "remote.origin.url", receiverUrl]), "Receiver destination configuration");
    for (const key of ["user.name", "user.email"]) {
      const value = spawnSync(gitExecutable, ["--git-dir", enclosingGitDir, "config", "--get", key],
        { env: gitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 30000 });
      if (value.status === 0) checked(git(repo, ["config", "--local", key, value.stdout.trim()]), "Receiver author configuration");
    }
  }
  emptyDirectory(hooks);
  validateConfiguration(repo);
  return repo;
}

export function validateConfiguration(repo) {
  const records = checked(git(repo, ["config", "--null", "--list", "--includes"]), "Receiver Git configuration inspection").split("\0").filter(Boolean);
  const urls = [];
  for (const record of records) {
    const split = record.indexOf("\n");
    const key = record.slice(0, split).toLowerCase();
    const value = record.slice(split + 1);
    if (key.startsWith("url.") && /\.(?:insteadof|pushinsteadof)$/.test(key)) throw new Error("Git URL rewrites must be reviewed before Receiver publication.");
    if (key.startsWith("http.") && ((key.endsWith(".sslverify") && value !== "true") || (key.endsWith(".followredirects") && value !== "false"))) throw new Error("Unsafe Git TLS or redirect configuration must be reviewed.");
    if (/^remote\..+\.(?:url|pushurl)$/.test(key)) {
      if (!/^remote\.origin\.(?:url|pushurl)$/.test(key) || value !== receiverUrl) throw new Error("Receiver Git destination must exactly match package.json and the approved Receiver repository.");
      if (key === "remote.origin.url") urls.push(value);
    }
  }
  if (urls.length !== 1) throw new Error("Receiver requires exactly one approved origin URL.");
}

export function networkArguments(repo, command, hash) {
  const prefix = ["-c", "protocol.https.allow=always", "-c", "http.sslVerify=true", "-c", "http.followRedirects=false",
    "-c", `http.${receiverUrl}.sslVerify=true`, "-c", `http.${receiverUrl}.followRedirects=false`,
    "-c", "credential.helper=", "-c", "core.askPass=", "-c", "fetch.fsckObjects=true", "-c", "transfer.fsckObjects=true"];
  if (command === "fetch") return [...prefix, "fetch", "--no-recurse-submodules", "--no-tags", "--no-auto-maintenance", "--refmap=", "--", receiverUrl, "refs/heads/main:refs/remotes/origin/main"];
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(hash)) throw new Error("Receiver push requires its full captured commit hash.");
  if (process.platform === "win32") prefix.push("-c", 'credential.helper=!"C:/Program Files/Git/mingw64/bin/git-credential-manager.exe"');
  return [...prefix, "-c", "push.followTags=false", "-c", "push.recurseSubmodules=no", "push", "--porcelain", "--no-follow-tags", "--no-verify", "--", receiverUrl, `${hash}:refs/heads/main`];
}

export function fetchReceiver(repo, run = spawnSync, allowEmpty = false) {
  const result = git(repo, networkArguments(repo, "fetch"), run);
  // A new destination may have no main yet. Authentication/network failures
  // must never be misclassified as an empty repository.
  if (allowEmpty && !result.error && result.status !== 0 && /couldn't find remote ref refs\/heads\/main/i.test(result.stderr ?? "")) return null;
  checked(result, "Receiver fetch");
  return checked(git(repo, ["rev-parse", "refs/remotes/origin/main"]), "Receiver fetched commit inspection");
}

export function isPrivatePath(path) {
  // A template inside a private directory still contains private material.
  if (/(?:^|\/)(?:private|private-state|secrets|\.secrets|credentials|\.credentials|\.creds|\.creds_example|\.fb_creds|\.keys|keys|\.node-cache)(?:\/|$)/i.test(path)) return true;
  if (/(?:^|\/)\.env\.(?:example|sample|template)$/.test(path)) return false;
  return /(?:^|\/)(?:\.env(?:\..*)?|[^/]+\.env(?:\..*)?|\.dev\.vars(?:\..*)?|.*keypair.*\.json|.*\.service-account\.json|.*firebase-adminsdk.*\.json|\.receiver-store[^/]*|\.mempool-store[^/]*|operator-state[^/]*\.json|receiver-export[^/]*\.json|wrangler\.toml|[^/]*\.(?:pem|key|p12|pfx|import\.sql|export\.sql|sqlite|sqlite3|db))(?:\/|$)/i.test(path);
}

export function checkPrivateTree(repo, tree) {
  const paths = checked(git(repo, ["ls-tree", "-r", "--name-only", "-z", tree]), "Receiver snapshot inspection").split("\0").filter(Boolean);
  for (const path of paths) {
    if (isPrivatePath(path)) throw new Error("Receiver snapshot contains a private configuration/state filename; nothing was pushed.");
  }
}

export function commitPushReceiver(repo, { runNetwork = spawnSync, timeout = pushTimeout(), message = "Update Receiver changes" } = {}) {
  if (typeof message !== "string" || !message.trim() || message.includes("\0")) throw new Error("Use a nonempty Receiver commit message.");
  packageDestination(repo.root);
  validateConfiguration(repo);
  const lock = join(repo.gitDir, "trustlink-publication.lock");
  let fd;
  try { fd = openSync(lock, "wx"); } catch { throw new Error("Another Receiver publication holds its lock; let it finish before retrying."); }
  try {
    if (checked(git(repo, ["symbolic-ref", "HEAD"]), "Receiver branch inspection") !== "refs/heads/main") throw new Error("Receiver publication requires the existing main branch; branches are never switched automatically.");
    checkPrivateTree(repo, checked(git(repo, ["write-tree"]), "Receiver existing index inspection"));
    const head = git(repo, ["rev-parse", "--verify", "--quiet", "HEAD"]);
    let parent = head.status === 0 ? head.stdout.trim() : null;
    if (head.error || ![0, 1].includes(head.status)) checked(head, "Receiver parent inspection");
    if (!parent && !repo.standalone) parent = fetchReceiver(repo, runNetwork, true);
    checked(git(repo, parent ? ["read-tree", parent] : ["read-tree", "--empty"]), "Receiver index preparation");
    checked(git(repo, ["add", "--all", "--", "."]), "Receiver staging");
    const tree = checked(git(repo, ["write-tree"]), "Receiver tree capture");
    checkPrivateTree(repo, tree);
    const previousTree = parent ? checked(git(repo, ["rev-parse", `${parent}^{tree}`]), "Receiver parent tree inspection") : null;
    const commit = tree === previousTree ? parent : checked(git(repo, ["-c", "commit.gpgSign=false", "commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message]), "Receiver captured commit");
    // Compare-and-swap preserves concurrent branch changes and failed-push retries.
    checked(git(repo, ["update-ref", "refs/heads/main", commit, head.status === 0 ? head.stdout.trim() : "0".repeat(commit.length)]), "Receiver branch update");
    if (checked(git(repo, ["rev-parse", "HEAD"]), "Receiver captured HEAD inspection") !== commit) throw new Error("Receiver HEAD changed; nothing was pushed.");
    const url = receiverUrl.replace(/\.git$/, "");
    console.log(`Pushing captured Receiver commit ${commit}; only Receiver files are included.`);
    const result = git(repo, networkArguments(repo, "push", commit), runNetwork, {
      timeout, env: { ...gitEnvironment(), GCM_INTERACTIVE: "Never", GCM_CREDENTIAL_STORE: "wincredman", GCM_TRACE: "false", GCM_TRACE_SECRETS: "false" },
    });
    try { checked(result, "Receiver push"); } catch (error) { throw new Error(`${error.message}\nThe local Receiver commit is retained; retry git:commit:push:all.\nRepository: ${url}`); }
    const tracked = git(repo, ["update-ref", "refs/remotes/origin/main", commit]);
    if (tracked.error || tracked.status !== 0) console.warn("Receiver push succeeded, but its local tracking ref could not be refreshed.");
    console.log(`Repository: ${url}\nBranch: ${url}/tree/main\nCommit: ${url}/commit/${commit}`);
    return commit;
  } finally { closeSync(fd); unlinkSync(lock); }
}

export function main(args, root = receiverRoot) {
  const [command, name, remote, branch, message] = args;
  if (!(["fetch", "commit-push-all"].includes(command)) || name !== "receiver" || remote !== "origin" || branch !== "main" || args.length < 4 || args.length > (command === "fetch" ? 4 : 5)) throw new Error("Usage: node scripts/git-repository.mjs <fetch|commit-push-all> receiver origin main [commit-message]");
  const timeout = pushTimeout();
  const repo = openRepository(root);
  if (command === "fetch") {
    fetchReceiver(repo);
    console.log("Fetched bigdreamsweb3/tsn-receiver main into Receiver publication metadata; no workspace files or branches were changed.");
  } else commitPushReceiver(repo, { timeout, message });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
