# Testing and verification evidence

**Status: CURRENT verification convention and bounded observed results, 2026-11-02.** Test existence, successful execution, local compilation, local proof, chain observation and complete settlement have different evidentiary value.

## Relevant existing suites

The SDK tests cover canonical message/recipient binding, GPRU derivation, balance/record recovery, device/session/receipt policies, TIN envelope/recovery and cross-chain facades. Receiver tests cover payload allowlists, public redaction, signed Node decisions, Node envelopes and local Firestore. Node unittest suites cover route/sender binding, nonce storage, threshold access, hidden-head snapshots, local proving, transport size and attestation. These suites are discoverable in their source directories; this inventory does not claim every suite passed in this run.

Program tests include TCAP governance/deposit fixtures and SDK program-boundary tests. Chain-dependent tests can fund accounts or submit transactions and require explicit operator action. The documentation reconstruction did not run them, start services, or treat a simulation as finalized payment evidence.

## Historical November 2 reconstruction checks

The root SDK build script failed on a missing root TypeScript launcher target. The installed SDK compiler then built TCAP SDK and TSN SDK successfully using the explicit command in [operations and verification](operations-and-verification.md). The canonical-payment-route suite passed all three tests: TIN-only message authorization, rejection of sender-supplied route fields and enforcement of the Node-resolved owner hash.

Four complete documentation examples passed TypeScript validation. Eight offline scenarios exercised UI/base-unit conversion, zero fee, owner-hash/request integrity, malformed hash rejection, unsupported precision rejection, HTTP acceptance, HTTP errors and readiness interpretation. Mock fetch prevented network calls, and the verifier created no wallet signatures. Wallet-credit preparation passed type checking only; its real RPC and signing callbacks were not executed.

The [November 2 hidden-head experiment](experiments/EXP-20261102-hidden-head.md) separately preserves fourteen local witness/prover tests, key verification and four SBF build results captured earlier. Those results are attributed to that experiment rather than claimed as repeated during documentation work.

## Documentation checks

The [local link report](../references/link-check.json) checks both existing documentation roots and Mintlify navigation. The [syntax report](../references/syntax-check.json), when available, records MDX compilation and Mermaid parsing. Parsing does not establish the browser layout or deployed site's behavior. Source links to the remote main branch may not yet expose local uncommitted changes; local catalogs retain the exact source file references.

`git diff --check` results must distinguish pre-existing dirty-line issues from newly introduced whitespace. Baseline inventory and source hashes were preserved in a local ignored audit folder; current source hash comparison checks that documentation work did not modify protocol/service/SDK source. This does not certify changes made independently by the user during deployment.

## Settlement evidence standard

For experimental native credit, retain exact funding, sealed-pool capture/release, Node decision and current lease, submitted credit signature/result, expected root/epoch transcript and owner opening/history recovery. Individual reserve assets/liabilities must remain unchanged. Separately verify complete aggregate epoch proof, authenticated total, one reclassification and preserved backing/uncredited pending. Confirm cluster/commitment level and sanitize evidence; raw witnesses, openings, TIN payloads, credentials and replayable service material must not enter reports.

The [November 7 experiment](experiments/EXP-20261107-private-credit-epoch.md) records later real-proof/native and cross-layer tests, including five typed examples and nine offline scenarios. Current SBF execution/compute, matching deployment, live multiwallet credit/epoch accounting and production privacy remain unverified. The [documentation status record](../DOCUMENTATION_STATUS.md) retains dated completion and continuation evidence.