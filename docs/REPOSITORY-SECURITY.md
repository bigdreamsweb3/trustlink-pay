# Local repository security

**Status: CURRENT local hardening, 2026-11-16.** These controls secure specific development workflows and have bounded verification. They do not certify application, circuit, dependency, chain or operating-system security. Git stores history and configuration in `.git`; the earlier lock failure came from an existing `index.lock`, and inspection did not establish malware in Git.

## Git sources and execution

The reviewed helper accepts these exact source URLs:

- `https://github.com/bigdreamsweb3/trustlink-pay.git`
- `https://github.com/Trustlink-Labs/TSN-Protocol.git`
- `https://github.com/Trustlink-Labs/TSN-Pitch-Deck.git` for the independent `pitch-deck` checkout

[repo-security.mjs](../scripts/repo-security.mjs) hardens root/protocol Git, the independent local pitch/research repositories where present, and retained root submodule metadata. Seven configurations were hardened here. Hooks point at an empty directory; fsmonitor and recursive submodule work are disabled; Git transports are denied by default; object/TLS checks are enabled; implicit pushes are refused. Existing submodule URLs remain metadata, with update mode `none` and locally denied transports. History and files are retained.

The project Git npm scripts use a real guarded helper. Fetch retrieves approved code without applying it; push requires the exact reviewed commit hash. The root `git:commit:push:all` explicitly stages the whole workspace, honoring Git ignores, then captures its tree and parent and pushes that exact commit. Root `git:commit:push:staged` retains selective staged-only behavior. Protocol/service `git:commit:push:all` aliases stage only the full protocol repository. The pitch-deck `push` helper stages only its independent checkout and targets its approved remote. Research imports and the former third-repository docs importer remain blocked. Versioned editor settings disable task/npm detection, Git autofetch and smart commits and enable sync/force-push confirmations. They cannot prevent a deliberately launched task or every extension; VS Code's application-only automatic-task preference was not added as a misleading workspace setting. Two later sidebar commits were observed waiting on commit-message editors; they ended without changing either HEAD. The original repeated npm task's trigger remains unverified.

Run the offline checks from the root:

```powershell
npm run security:check
```

After reviewing a new copy, apply checkout-local settings with these commands. The shared helper supports a root clone, a standalone protocol clone and the current nested layout; only Git boundaries that exist are available for operations.

```powershell
node scripts/repo-security.mjs harden
node scripts/repo-security.mjs check
```

Windows uses the signature-verified `C:\Program Files\Git\cmd\git.exe`; other installations require reviewing that path. Other hosts require trusted Git on PATH. Private config backups and a source map are saved outside source in `trustlink-git-hardening-*` Temp directories. The original five-config baseline and pre-removal indices were additionally preserved under `%LOCALAPPDATA%\Temp\trustlink-repo-hardening-20261116`. Backups can contain sensitive metadata; do not publish them.

Only for an explicitly requested fetch, select an ordinary branch and supported pair:

```powershell
node scripts/repo-security.mjs fetch workspace origin main
node scripts/repo-security.mjs fetch protocol origin main
```

The helper validates exact destinations, rejects URL rewrites and unsafe scoped HTTP settings, strips ambient `GIT_*` overrides and disables redirects/hooks/submodule recursion/automatic maintenance. Fetch clears credential helpers/prompts and updates only the selected remote-tracking ref; both approved fetches were exercised successfully after the user authorized publication. The legacy `git:pull:*` names perform this fetch without merging or checking out files. Review diffs before applying or executing fetched code.

For an explicitly approved push from the root, inspect the intended HEAD and run the current-commit task:

```powershell
git rev-parse HEAD
npm run git:push:current
```

This task captures the selected repository's current HEAD and pushes that exact commit after destination, branch and private-tree checks. It does not stage or commit pending edits. The protocol package's `git:push:current` does the same for its independent repository. To require an independently recorded full hash instead, use `node scripts/repo-security.mjs push workspace origin main <reviewed-commit-hash>`; the standalone `push` command retains its explicit hash gate.

For a deliberately requested whole-workspace publication, review `git status` and the pending source before running the root command from any directory:

```powershell
npm --prefix "C:\Users\codepara\Desktop\trust-link" run git:commit:push:all
```

The root all command stages tracked edits/deletions and untracked files that Git does not ignore, including root `package.json`, application directories, docs and the protocol subtree. Private filename checks run before and after staging and again on the captured tree. It does not force-add ignored keys/state/cache files. A run with no new changes still pushes the existing exact HEAD, allowing a failed push to be retried without creating a duplicate commit. This command deliberately publishes the reviewed workspace; do not launch it from an automatic task or hook. Root publication does not advance the independent protocol repository's HEAD; publish that repository separately after capturing its intended changes.

To publish all reviewed protocol changes to Trustlink Labs, run either of these equivalent commands:

```powershell
npm --prefix "C:\Users\codepara\Desktop\trust-link" run git:push:tsn-protocol
npm --prefix "C:\Users\codepara\Desktop\trust-link\tsn-protocol" run git:commit:push:all
```

Both stage and commit the full nonignored protocol checkout before pushing its exact commit to `https://github.com/Trustlink-Labs/TSN-Protocol.git` on `main`. Protocol `git:push:all` and the Node/Receiver/gateway `git:commit:push:all` aliases use the same whole-protocol scope, regardless of the launching directory. Root-only files are excluded from the Labs repository. For selective protocol publication, stage reviewed paths and run its `git:commit:push:staged`; for an existing commit only, use its `git:push:current`.

For the explicitly requested pitch-deck publication, review its pending changes and run either equivalent command:

```powershell
npm --prefix "C:\Users\codepara\Desktop\trust-link" run git:push:pitch-deck
npm --prefix "C:\Users\codepara\Desktop\trust-link\pitch-deck" run push
```

Both aliases use the parent workspace's guarded helper with `commit-push-all pitch-deck origin main`. The parent tooling checkout must be present. They capture only the deck repository, preserve the checked-out branch and push the exact commit to `https://github.com/Trustlink-Labs/TSN-Pitch-Deck.git`; a successful push to `main` triggers that repository's Pages workflow. The root `git:commit:push:all` task publishes the root workspace to TrustLink Pay and does not advance the deck's independent Git history. Pages deployment requires separate workflow/site verification.

Every successful guarded push finishes with links to its actual approved repository, branch and captured commit. Failed network pushes include the repository link without claiming the commit was published. After Git accepts a push, the helper refreshes the selected local remote-tracking branch to that accepted commit; direct URL pushes otherwise leave `origin/main` stale. A local tracking-update failure reports a warning while preserving the successful remote result and destination links. This tracking update changes neither the checked-out branch nor pending source/index contents.

Pushes now allow 15 minutes for packing and upload instead of the previous two-minute cutoff. `TRUSTLINK_GIT_PUSH_TIMEOUT_MS` accepts an integer from `30000` to `3600000` milliseconds and is validated before staging or committing. For a slower connection, set a longer limit in the PowerShell session before retrying the existing root commit:

```powershell
$env:TRUSTLINK_GIT_PUSH_TIMEOUT_MS = '1800000'
npm --prefix "C:\Users\codepara\Desktop\trust-link" run git:push:current
```

A timed-out push retains its local commit, and the remote result must be checked separately. `git:push:current` retries the captured HEAD without adding the new helper/documentation edits to another commit. Use `git:commit:push:all` only when those pending changes should also be captured. For an existing deck commit, the equivalent retry is `node scripts/repo-security.mjs push-current pitch-deck origin main` from the parent workspace.

Run one publication task at a time for each repository. Failed staging, commit, fetch and push operations report fixed categories for timeout, lock, permissions, disk space, capture-buffer overflow, unsupported paths, embedded repositories without a commit, authentication, connection or remote reconciliation. Raw diagnostics and configuration values remain withheld. A timeout alone does not prove a lock or permission problem; let an active task finish and retry rather than deleting locks or terminating unrelated processes.

For selective publication, stage only reviewed paths, inspect `git diff --cached`, then run `npm run git:commit:push:staged` from the root. This command commits only staged changes; empty staging remains a successful no-op. To use a chosen message and an independently recorded tree, obtain `git write-tree` and supply both arguments:

```powershell
npm run git:commit:push:staged -- <reviewed-staged-tree-hash> "Describe the reviewed change"
```

Angle-bracket values are placeholders, not commands to paste literally. Root `git:push:tsn-protocol` selects the nested protocol repository; its own `git:push:all` selects the standalone protocol. Windows pushes use the fixed signature-verified Git Credential Manager and its secure credential store, with interaction disabled. Push sends the exact reviewed commit object, refuses force/tags/submodule pushes and never re-enables transports persistently. Commit/push builds the exact reviewed tree and updates the branch only if its parent still matches, preventing an index/HEAD race from substituting another change.

## Dependencies and private state

All 20 discovered source npm packages have their own `.npmrc`: official HTTPS registry, TLS validation and `ignore-scripts=true`, with audit retained. Sixteen locks contain 2,801 recorded official-registry resolutions and eight in-project links. Exact-version registry metadata repaired 321 missing URL/integrity records in five locks without changing existing versions. A new TCAP SDK lock pins its previously unlocked TypeScript dependency at 6.0.3, preserving the declared range. Registry hashes validate bytes against metadata, not code trust or absence of vulnerabilities.

Use lockfile installs with explicit `--ignore-scripts`. Named npm scripts still run; automatic pre/post scripts are suppressed with installed npm 11.15.0. Frontend/backend `prebuild` preparation therefore needs explicit reviewed invocation. esbuild, sharp and other native packages can need package-specific rebuilds after source review; do not globally enable install scripts to bypass a missing binary. No clean checkout dependency install, native lifecycle execution or clean-machine build was performed.

Automatic Python/mempool and Windows/WSL setup helpers fail before dependency installation or workspace copying. Python requirements remain minimum-version ranges without a reviewed complete artifact-hash lock. Manual pip commands and the existing Docker build are outside these helper guards; establish a platform-specific pinned/hash lock in isolation before using them as a secure install workflow. Existing Python environments and deployment configuration remain intact.

Both Git boundaries ignore private `.env.*` variants while retaining exact example/sample/template names. Protocol rules also cover generic keypair/program-key and nested key JSON paths. All Receiver-store names are excluded, including snapshot, temporary, lock and backup suffixes; four snapshots and a root-only lock were removed from the applicable indices while the two present local files were retained. Publication is scoped to the user-authorized security changes. Ignore rules do not remove already-published history or prevent explicit force-add.

An inert Cargo RPC credential and two documentation copies were removed/redacted without changing active Anchor configuration or services. **Provider-side credential revocation/rotation remains necessary.** Previously published Receiver state needs separate exposure review; history cleanup requires explicit authorization and coordination. Keep private keys, witnesses, service credentials and replayable authorization payloads out of shared evidence.

## Verification and limits

Security regressions cover exact-source rejection, Git transports/hooks/submodules, scoped redirects and case-sensitive subsection collisions, ambient overrides, reviewed commit/tree gates, standalone clone layouts, all source npm Git aliases, registry/SRI policies, private-state suffix tracking and a Python guard that launches no subprocess. A separate isolated marker probe verified URL-scoped credential helpers were cleared. Signature checks covered Windows Git and Credential Manager; setup syntax and ignored paths were checked. The [November 16 validation record](references/REPO-SECURITY-20261116.md) records outcomes and unresolved checks.

A permitted repository owner can publish unsafe code, dependencies can be compromised and a same-user process can alter these controls or override Git/npm options. These settings cover known configurations and the reviewed helper, not arbitrary new repositories or an OS sandbox. Full application/protocol vulnerability testing is separate. The user's later push request authorizes the scoped Git publication; it grants no authority for deployment, transaction signing, service operations, firewall changes or [Security Watch](../security-watch/README.md) enforcement.
