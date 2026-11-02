# Historical SDK and UI verification handoff

**Status: HISTORICAL; old paths, creation restrictions and test results are a checkpoint, not current requirements.** The original prompt below is retained as a repair record. Its ban on direct TIP creation, missing-allocator assumption and credit-only live assertion are superseded for present architecture. Current TIP source supports direct/staged version-1 registry creation, distinct from global-state version 3. A configured witness/prover path now exists, but a complete native credit still needs current deployment/account/proof and payment evidence.

For current work read [AGENTS.md](../AGENTS.md), [terminology](architecture-terminology.md), [architecture map](../docs/laboratory/architecture-map.md), [TIN issuance](../docs/protocol-flows/tin-creation/README.md) and the [maintenance manual](../docs/DOCUMENTATION_MAINTENANCE.md). Check actual UI routes and package scripts before selecting tests. Old pass/fail counts must not be reported as rerun results. Preserve genuine user approvals, exact signed-wire handling and role separation; this prompt does not authorize any Git or chain action.

## Original historical prompt

# TSN / TrustLink Codex Verification Prompt

You are verifying and repairing the current TrustLink repository. Work from the repository root:

`C:\Users\codepara\Desktop\trust-link`

## Mission

Audit the latest TSN SDK, protocol-test dapp, TSN docs, and their boundaries. Fix real defects at the root cause. Preserve working behavior and user changes. Do not invent protocol behavior to make a screen look complete.

## Current changes to verify

- `protocol-tests/ui/server.mjs`
  - Loads the built SDK through a Windows-safe `pathToFileURL` import.
  - Has SDK-backed TIN/payment/funding routes.
  - Wallet-to-wallet compatibility uses a recipient wallet address only and builds an unsigned SPL transfer transaction.
  - It must never generate a fake TIN.
  - TIN creation currently returns `TIP_TIN_ALLOCATOR_NOT_WIRED` because TIP/TSN Cranker allocation is not wired.
- `protocol-tests/ui/public/tsn-dapp.js`
  - Opens the TSN Wallet Dapp by default.
  - Wallet-to-wallet payment has no TIN, route commitment, or route-version inputs.
  - TIN creation asks only for display name; the user must never choose a TIN.
  - Debit-to-credit and debit-to-exit remain visibly gated until SDK/account/proof prerequisites exist.
- `tsn-protocol/sdks/tsn-sdk/src/tsn-exit.ts`
  - Must not contain malformed public keys or import-time crashes.
  - TCAP program configuration must be runtime/deployment-specific when no valid pinned ID exists.
- `tsn-protocol/tsn-docs`
  - Three user-facing pages belong under `how-it-works/`.
  - Navigation and links must target the new paths.
  - Documentation must describe current behavior, not retired or hypothetical APIs.

## Non-negotiable protocol rules

1. Users do not choose TINs. TIN assignment belongs to the TIP program / TSN Cranker allocation flow.
2. The server must never generate, guess, or fabricate a TIN.
3. Do not restore direct TIP `createTin`; the current TIP SDK explicitly disables direct creation.
4. Do not claim TIN creation works until the allocator result is wired into the TSN Node creation contract.
5. Wallet-to-wallet compatibility is wallet-address based only. Do not ask for or resolve a TIN, route commitment, or route version in that flow.
6. TIN payments may use the latest active route commitment/version only after resolving them from the TIP TIN account. Never let users type historical route data.
7. Do not use fake route commitments, placeholder proofs, fake signatures, or fake program IDs.
8. Debit, confidential debit, and exit remain proof-gated unless the repository contains the complete verified builder, account contract, proof checks, and tests.
9. Do not silently turn a preflight or unsigned transaction into a submitted/confirmed transaction.
10. Never expose private keys, seed phrases, plaintext roots, snapshot keys, or service API keys to browser code.
11. Keep Receiver, Node, Cranker, TIP, TSN, and TCAP responsibilities separate.
12. Preserve the credit-only live path and fail closed when prerequisites are missing.

## Strict engineering rules

- Read current file contents before editing; other edits may exist.
- Never revert user changes or unrelated work.
- Use the smallest focused edit that fixes the root cause.
- Use `apply_patch` for edits; do not write files with shell redirection or ad hoc scripts.
- Do not commit, push, reset, checkout, or create branches.
- Do not add dependencies unless the existing package boundary requires them.
- Do not rewrite or reformat unrelated files.
- Do not hide failing tests. Report exact failures and classify them as fixed, pre-existing, or blocked.
- Prefer executable validation over visual assumptions.
- Validate Windows paths and ESM imports on Windows.
- Keep public APIs and security boundaries explicit.
- Do not claim a feature is live when it is only prepared, simulated, preflighted, or gated.

## Required checks

Run these from the repository root:

```powershell
npm run tsn:sdk:build
node --input-type=module -e "await import('./tsn-protocol/sdks/tsn-sdk/dist/index.js'); console.log('SDK_IMPORT_OK')"
node --check protocol-tests/ui/server.mjs
node --check protocol-tests/ui/public/tsn-dapp.js
npm run tsn:receiver:test
npm run tsn:sdk:test
```

Also verify docs navigation:

```powershell
$docs = Get-Content 'tsn-protocol/tsn-docs/docs.json' -Raw | ConvertFrom-Json
$pages = @()
foreach ($tab in $docs.navigation.tabs) { foreach ($group in $tab.groups) { $pages += $group.pages } }
$missing = @($pages | Where-Object { -not (Test-Path (Join-Path 'tsn-protocol/tsn-docs' ($_.Replace('/','\\') + '.mdx'))) })
if ($missing.Count -gt 0) { throw ('Missing docs pages: ' + ($missing -join ', ')) }
```

## Baseline known at handoff

- `npm run tsn:sdk:build`: passes.
- Built SDK import: passes with only the optional bigint native-binding warning.
- UI server and dapp syntax checks: pass.
- `npm run tsn:sdk:test`: 70 pass, 1 fail because `tests/settlement-token.test.mjs` imports missing `dist/settlement-token.js`. Investigate whether the source module was removed, omitted from `tsconfig`, or the test is stale. Do not paper over it.
- `git diff --check` may report warnings from existing long one-line markup in the dapp; clean only touched lines if practical.

## Expected response

Report findings first, ordered by severity, with file references. Then report:

- exact files changed
- exact validation commands and results
- unresolved failures and why they remain
- whether each flow is live, unsigned/prepared, simulated, gated, or unavailable

Do not say “all clean” while any required check fails.
