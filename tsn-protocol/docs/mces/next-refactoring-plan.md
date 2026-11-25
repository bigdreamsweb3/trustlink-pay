# Proposed next MCES implementation: Receiver

**Status: original implementation plan, approved on November 17, 2026.** The user selected Receiver and additionally requested local work files grouped by TCAP accounting epoch/kind, with funding/TIN unassigned. [Receiver architecture](../../services/tsn-receiver/docs/architecture.md) and [verification](../../services/tsn-receiver/docs/verification.md) record implementation and bounded evidence. Firebase preservation below describes this original extraction, not the current storage contract; the [D1 replacement](../../services/tsn-receiver/lib/storage/record-store/README.md) is separate. The [ranking](candidate-ranking.md) and [assessment](candidate-assessment.md) preserve the pre-refactor selection rationale; this sequence does not authorize another service's refactor.

## Intended contract and scope

Apply the [verified Node reference](../../services/tsn-node/docs/architecture.md) to Receiver's existing responsibilities. The intended result is one implementation for each authored function, grouped by responsibility, with explicit narrow dependencies, stable framework/import facades, a reviewable component inventory and behavior-preserving tests. Use idiomatic TypeScript named exports and typed dependency interfaces; Python class descriptor assembly is not a TypeScript requirement.

Keep the work database, monotonic state versions, work document shapes and Next.js runtime. The approved local adapter change replaces the monolithic file with an ordered manifest and individual records; hosted storage retains its format. Receiver remains the durable coordination authority. Node retains verification/proving and Mother authority; Cranker retains permitted submission. Do not move those implementations into Receiver, add a queue, invent cryptography, change protocol layouts, remove a distinct execution family or retain an obsolete fallback.

Root Git publication work discussed alongside this assessment is a separate workflow; it does not authorize the MCES implementation. Existing application/source work, instructions, configurations, keys, program IDs and user-managed processes remain preserved. Any later service startup, signing, submission, deployment or Git publication requires its own applicable authorization.

## Stable interfaces and invariants

- Preserve every current `app/api/**/route.ts` path, exported HTTP method, runtime declaration, request/response field, status code and authentication boundary. Characterize error mapping per route rather than standardizing distinct errors during extraction.
- Preserve `lib/store.ts` exports, `ReceiverWork`/`WorkKind`/`WorkStatus` contracts and the original helper entry modules for all direct consumers. Facades delegate to one implementation; they do not retain parallel runtimes.
- Preserve exact Node attestation fields, canonical JSON/commitment behavior and encrypted envelope format. Receiver and Cranker have separate serialization implementations; do not merge locale-based and lexical key comparators as an incidental cleanup.
- Preserve caller-specific private/public/Cranker projections, nested proof allowlists, funded-note envelope retention and compaction. Receiver exposure to ingress is an existing trust boundary, not a new operator-blindness guarantee.
- Preserve idempotency, atomic Firestore read/write groups, transition history, lease generation/owner/version/expiry and shared `global-root` lock ownership. A persistence port must retain transaction callbacks and query/snapshot semantics; it must not turn one transaction into separately committed operations.
- Preserve 60-second Node claims and the current 180-second native settlement/accounting Cranker claims, with existing other-work durations. Preserve funding-confirmation gates, accounting priority, candidate ordering/shuffling, deferral and uncertain signed-attempt locking.
- Preserve signed checkpoints before broadcast, immutable attempt identity, expired-report reconciliation and strict nonexecution evidence requirements. A missing receipt alone must not free the lock or authorize replacement.
- Preserve Cranker challenge/session/DNA admission, strictly increasing request counters, idle/max lifetimes, exact request-byte signatures and the current lease rate limit. Retain Node service-key authentication as its separate boundary.
- Preserve wake notifications only after durable state changes, their payload-free shape, current fallback/error decisions and safe error projections. Keep recovery endpoints and signing forwarding behavior unchanged.
- Preserve Firebase credential normalization and existing initialization/error timing, environment/collection defaults, explicitly gated local JSON mode, relative file-path meaning, file-lock retries/stale-lock rules and cross-process transaction behavior.

These are preservation requirements derived from current service source and the [service API](../../tsn-docs/api-reference/services.mdx), not approval to change their behavior. The [credit ABI](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/credit-abi.md) remains the authority for native account, proof and signed-message requirements.

## Dependencies requiring special attention

`firebase-admin` and [former lib/firebase.ts; current database facade](../../services/tsn-receiver/lib/database.ts) own the current adapter selection and exported collections. Several modules construct collections at import time. Capture that timing before moving composition; changing eagerly validated credentials into silently deferred checks would change behavior. Keep hosted Firestore and [former local-firestore.ts; current JSON facade](../../services/tsn-receiver/lib/local-json-store.ts) as distinct adapters behind the same actual operations, without claiming that local tests establish hosted equivalence.

Next.js route resolution and Node crypto imports constrain package exports and bundling. The modular implementation must remain compatible with the existing module resolution and server-only execution. Do not change Next/React/TypeScript versions, manifest dependencies, build helpers or service configuration merely to support the new layout.

Node authorizations are HTTP dependencies and Cranker admission/receipt validation uses Solana RPC. Introduce narrow injected ports for the existing calls, clock, entropy, collections, notifications and verification operations. Preserve await/synchronous ordering, fallback lists, exact domain errors and fail-closed decisions. Node's composition/configuration remains unchanged; downstream consumers should not import Receiver implementation internals.

Existing tests transpile source and stub neighboring modules in temporary directories. Preserve their assertions and fixture identities while gradually moving setup into explicit test components. Source-text assertions are not substitutes for executable contract checks. No live Firebase/RPC environment or production secret is needed for the initial extraction baseline.

## Incremental execution sequence

### 1. Baseline inspection

After implementation approval, reread the root instructions, Node reference and applicable canonical records. Inspect the current working tree again, because this assessment is a dated snapshot. Capture hashes and an external immutable copy of Receiver authored source, tests, configuration, manifest and public route/export inventory. Identify existing local edits and private/generated exclusions; do not stash, reset, rename or remove them.

Record which existing imports/exports are externally consumed, hosted/local adapter initialization timing, every work kind and all authentication/projection variants. Keep the source baseline independent of the refactor and retain failures as observed. The source assessment's successful tests are a starting record, not the next task's baseline.

### 2. Existing behavior and test capture

Run the current non-emitting typecheck and all Receiver tests before editing. The assessment checkpoint was 46 passing tests, zero failures/skips; compare identities and outcomes, not only totals. Record temporary state, mocked services and tested/untested boundaries.

Capture deterministic request/response/error fixtures for Node leasing/renewal/decisions, Cranker claims/checkpoints/reports/retries, authorization/signature forwarding, ingress/idempotency, public work views and receipt/nonexecution recovery. Add focused characterization for uncovered Cranker challenge/session/counter/DNA paths before extracting their implementation. Use synthetic credentials/accounts and stubbed network responses; preserve the old implementation in the captured baseline for differential comparison.

Do not start production services or install dependencies to manufacture a clean baseline. Report any unavailable checks and obtain the actual missing prerequisite through the separately authorized workflow. Hosted adapter/emulator verification is a later explicit gate, not a reason to silently equate local JSON with Firestore.

### 3. Architecture mapping

Map current functions to models/contracts, ingress, projection, leases/transitions, submission evidence, reconciliation, authentication, Node/RPC transport, notifications and storage. Record inputs, outputs, errors, direct consumers, mutable state and each transaction's read/write boundary. Treat `lib/store.ts` as the future stable facade, while preserving `app/api/` as framework routing.

Specify TypeScript implementation-file rules, including methods, callbacks and test fixtures, before extraction. A callback that closes over state becomes a named component with explicit parameters/dependencies; it must not acquire hidden application/global lookup. Framework entry modules should re-export or delegate to the single handler implementation in a manner validated by the existing Next build contract. Avoid inventing generic factories, version dispatch or interfaces with no current consumer.

### 4. Component extraction

Extract one functional family at a time, keeping its original entrypoint and running its relevant tests before proceeding:

1. **Deterministic work-contract functions first:** allowlist checks, payload delta/reconstruction, commitments and public/Cranker projection. Keep canonical bytes and legacy record-reading behavior identical. Models/constants can remain function-free modules.
2. **Ingress and queries:** receipt/idempotency, encrypted payload selection and work lookup/list functions. Inject only their actual store/clock/entropy/envelope dependencies; preserve paired funding/settlement creation in one transaction.
3. **Lease and transition commands:** separate reclamation, eligibility and mutation responsibilities only where the current transaction remains atomic. Preserve shared-root locking, lease generation/duration, checkpoint preservation and notification timing. Do not change randomization or accounting priority to simplify tests.
4. **Authorization/checkpoint/recovery families:** retain exact matching checks and existing receipt/nonexecution evidence ports. Keep uncertain signed work protected throughout extraction.
5. **Authentication, notifications and storage composition last:** proceed only after their behavior fixtures and adapter semantics are captured. Extract session/DNA/replay/rate functions and local adapter methods with explicit state ownership; keep current credential handling and environment behavior.

Move code only after proving its callers can use the replacement; remove superseded bodies after verification. Keeping a stable re-export is permitted as an interface, while keeping a second old implementation is not. Do not extract Cranker, Node, SDK, gateway or cross-chain implementations in the same task.

### 5. Interface and dependency isolation

Introduce the smallest ports used by the extracted families, such as a transaction-capable work store, clock, notification operation, Node authorization request and receipt/DNA reader. Keep the hosted/local adapters at a Receiver composition boundary and make process state ownership explicit. Do not create a general service locator or expose a Firestore-wide `any` namespace as a supposedly narrow port.

Check that direct importing modules still resolve the documented facades and that stateful components can be tested with small local dependencies without initializing Firebase or importing a route. Freeze Node/Cranker HTTP fixtures and SDK-facing transaction shapes; if extraction requires changing an upstream public contract, stop that slice and reassess its scope.

### 6. Documentation restructuring

Add Receiver-local architecture, verification, component inventory and functional package READMEs using the Node's conventions. Record contracts, ownership, dependencies, errors, public facades, test identities and unmeasured coverage. Preserve the existing service README, instructions and useful historical documentation; add canonical links rather than duplicating the protocol textbook.

Review internal canonical/operating records and public Receiver/service pages for actual impact. A structural-only change should leave their API and operating procedure descriptions intact, aside from necessary source pointers. Keep internal self-hosting instructions out of the protocol/community subtree; links to root-only repository files use the approved HTTPS repository URLs.

### 7. Component-level testing

For each extracted family, rerun its original tests and add meaningful port-boundary tests where existing coverage was missing. Compare pre/post results using the same source-independent fixtures. Prioritize canonical commitments, nested privacy projections, authorization refusal, lease races, cross-process locking, rollback and durable-before-wake ordering over tests that merely assert file names.

Preserve test identities and the approved one-function implementation policy for fixtures/callbacks. Report stubbed attestation and RPC scope explicitly. Include wrong actor/version/lease, duplicate ingress, concurrent claims, missing/malformed proof projections, signed attempt conflicts and unavailable dependency behavior where that family owns the decision.

### 8. Integration verification

Run the full available Receiver offline suite, non-emitting typecheck and the existing build in an isolated approved build context if prerequisites are available. Compare complete routes/methods, export signatures, response fields/statuses, canonical payload bytes and configuration behavior with the retained baseline.

Use in-process route calls and fake Node/RPC/wake ports for Node-Receiver-Cranker flows without changing their services. Exercise a synthetic funding-to-settlement sequence, native accounting serialization/locking, checkpoint/expiry/reconciliation and public projection. Reuse the unchanged Cranker helper suites and Node offline harness for their relevant consumer seam when available; a helper pass is not whole-system execution.

Separately verify hosted Firestore transaction/admission semantics through an isolated authorized emulator or dedicated test environment when available. If that environment is absent, record hosted parity as unverified and do not call the refactor operationally complete. Live startup, signing, chain execution and private owner recovery remain separately authorized acceptance work rather than implicit MCES checks.

### 9. Final architectural audit

Audit every authored Receiver function/method/callback and test component against the agreed organization policy. Check explicit imports, cycles, composition/state ownership, documented ports and stable facades. Search for duplicate/superseded bodies, hidden globals, dynamic namespace manipulation and unrelated changes. Review every retained migration/legacy reader for an actual stored-state obligation; do not remove a distinct compatibility contract during structural work.

Compare the full source/API/configuration/test baseline, record all checks and missing prerequisites, and inspect documentation links/formatting. The final report must distinguish source organization, fixture verification, hosted integration and live operation. Approval to accept that bounded refactor does not automatically authorize publication or deployment.

## Exit and stop conditions

The Receiver implementation is ready for review only when the agreed component inventory is complete, existing public/configuration contracts remain equal, meaningful extraction and full available-suite checks pass, unrelated work is preserved and every unperformed operating check is identified. Complete operational verification additionally requires the appropriate isolated hosted/consumer evidence rather than a file-count audit.

Stop a slice if it changes signed/canonical bytes, privacy fields, actor permissions, record compatibility, transaction atomicity, lease behavior, checkpoint identity or upstream API/configuration. Preserve the last verified extraction and record the mismatch; do not redesign the protocol or change another service to make the test pass. This assessment authorizes none of those implementation steps: wait for explicit approval before beginning the next MCES refactor.
