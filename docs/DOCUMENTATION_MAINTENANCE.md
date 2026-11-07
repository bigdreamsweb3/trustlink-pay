# TSN documentation maintenance manual

**Status: CURRENT engineering procedure, established 2026-11-02.** Use this manual for requested documentation work and for meaningful implementation changes that alter documented behavior. It governs maintenance of the existing internal Laboratory and public Mintlify handbook. Its architecture pointers are starting references; executable program, SDK, Receiver, Node and Cranker contracts determine behavior. A source description, test result, deployment observation and complete payment are separate claims.

## Entry instructions and authority

Begin with the applicable `AGENTS.md` instructions, then read [architecture terminology](../.codex/architecture-terminology.md), this manual and the relevant canonical pages. Protocol changes additionally require the [architecture-change policy](../.codex/architecture-change-policy.md). The [Codex reference index](../.codex/README.md) identifies current guidance and historical prompts; ordinary Markdown is read explicitly when relevant.

The [official Codex guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md) describes automatic discovery: Codex-home instructions first, followed by at most one instruction file in each directory from project root to the launch working directory. `AGENTS.override.md` precedes `AGENTS.md`, followed by configured fallback filenames. Deeper instructions take precedence, subject to the configured combined byte limit (32 KiB by default). Linking a reference does not automatically load its contents. This checkout has one repository `AGENTS.md`; do not introduce redundant nested instruction files solely to create layers. Inspect discovery again if the profile or checkout structure changes. User instructions control authorization, and historical task prompts cannot authorize Git, service or chain operations.

Use [Laboratory architecture](laboratory/architecture-map.md), [components](laboratory/components.md), [credit ABI](laboratory/credit-abi.md), [cryptography](laboratory/cryptography.md), [invariants](laboratory/invariants.md) and [technology](laboratory/technology-reference.md) to locate the affected contract. Consult [reconciliation](laboratory/reconciliation-register.md), [decisions](laboratory/decisions/README.md) and [documentation status](DOCUMENTATION_STATUS.md) before resolving an apparent contradiction. Never invent an API, approval, migration, cryptographic guarantee or missing historical explanation.

## Two destinations and existing directory conventions

| Destination | Responsibility | Keep out |
| --- | --- | --- |
| `docs/` | Internal Laboratory, engineering contracts, source/account details, experiments, decisions, runbooks and bounded evidence | Credentials, secrets, private witnesses, raw private payloads and replayable service tokens |
| `tsn-protocol/tsn-docs/` | Public protocol concepts, developer SDK/API contracts, integration examples, operator boundaries and troubleshooting | Internal-only operational material, unreviewed proposals presented as capabilities, copied engineering notebooks |

Within `docs/`, use `laboratory/` for canonical component/ABI/cryptography/state references, `laboratory/experiments/` for observations and `laboratory/decisions/` for ADRs. Existing `team/`, `protocol-flows/`, root runbooks and `research/` publications retain their ownership and paths. `historical-archive/README.md` indexes valuable superseded material at its original location. `references/` holds source catalogs, review dispositions and validation results; discovery metadata is not proof of implementation.

The public handbook uses MDX frontmatter and [docs.json](../tsn-protocol/tsn-docs/docs.json) navigation. Preserve established `overview/`, `layers/`, `developers/`, `sdk/`, `api-reference/`, `operators/`, `security/`, `testing/` and `glossary/` routes. Inspect adjacent pages before adding a route. Both READMEs provide entry summaries and diagrams; they link detailed contracts rather than duplicating them. Cross-link internal and public explanations where appropriate, while keeping their audiences distinct.

Do not run a docs pull simply because the directory exists. The current architecture map records actual Git boundaries, and [pull-tsn-docs.mjs](../scripts/pull-tsn-docs.mjs) requires a clean standalone docs checkout. It refuses this populated non-standalone tree. Confirm repository ownership and user authorization before any fetch/pull/stash/commit/push; do not automatically stash unrelated work.

## Repeatable change workflow

### 1. Identify scope and preserve the baseline

Inspect Git status and current file contents before editing. Classify the request as functionality, architecture, SDK/API, research, experiment, bug/security fix, deprecation/history, onboarding or operations. Record affected claims, intended audience and expected validation. Preserve unrelated edits, newline conventions, program IDs, keypairs, deployment settings and user-managed processes. For a documentation-only assignment, record relevant source hashes before changes if preservation evidence is needed; keep local evidence sanitized and report a missing original baseline.

### 2. Investigate implementation and history

Read the relevant source, tests, types, account/instruction layouts, configuration names and deployment scripts. Follow the same data through all actors participating in the flow. Identify callers and actual enforcers, not merely exported names. Parse credential-bearing configuration without printing its values. Compare canonical documents and recorded ADR/experiment evidence; a feature description or old discussion does not establish behavior.

For native wallet-to-TIN credit, verify sender message/deposit approval, Receiver ingress and leases, Node funding verification, unchanged Cranker submission, confirmed funding, independent current-root settlement proving, Mother authorization, TSNP → TCAP → GPRU checks, atomic root/epoch-transcript mutation, complete aggregate liability accounting and owner Memo recovery. Epoch Treasury/AcceptedIntent/Settlement DNA/private payout/refund are a distinct retained family. Do not insert those stages into native credit or infer enabled debit/exit from their source presence.

### 3. Classify each claim

| Claim classification | Required evidence and wording |
| --- | --- |
| Implemented / CURRENT | Inspected executable contracts and callers support the described behavior; identify configuration gates. No implication that it ran successfully. |
| Tested | Name command, scope, fixture/runtime, date and result. Offline mocks, local proofs, simulation and integration tests have different limits. This is an evidence qualifier, not a page-inventory status. |
| VERIFIED | A specific observation or behavior is established by retained evidence. State exactly what was verified, on which version/cluster/date; do not label an entire network verified from one test. |
| EXPERIMENTAL | Active unfinished mechanism or trial; describe prerequisites, results and failure boundaries. |
| PROPOSED | Unadopted design or unresolved engineering decision; it must not instruct ordinary runtime implementation as settled policy. |
| DEPRECATED | Still supported but explicitly being phased out; cite the decision/replacement and migration constraints. Age or a version suffix is insufficient. |
| RETIRED | Explicitly abandoned architecture/capability; retain valuable records with a current replacement pointer. ZK-PRU is historical/retired context. |
| HISTORICAL | Dated earlier description or observation retained for research; its original result can remain valid without describing today's architecture. |
| UNVERIFIED | Insufficient evidence, unknown reachability, unsupported guarantee or stale operational observation. Record the missing check. |

The [document review](references/document-review.json) drives inventory page status. Mixed pages use a conservative overall disposition and explicit local qualifiers. The [claim review](references/claim-review.json) records bounded evidence selectors. A successful parser, catalog generator or link check must never promote a behavioral assertion into VERIFIED.

### 4. Map documentation impact

List the smallest set of affected internal/public pages, READMEs, examples, diagrams, status records and instructions. Review the mapping below; update an ADR when the decision changes, rather than creating one for every prose correction. Search for the changed symbol/term/guarantee and inspect each match in context. Historical records may retain old names under an explicit historical boundary.

### 5. Update internal records

Document actual data, accounts, required signatures, state transitions, failure recovery, tests and architectural implications. Give source paths and named enforcers for important guarantees. Record newly discovered contradictions in `laboratory/reconciliation-register.md` and unresolved questions in the applicable component/decision record. Preserve original experiment outcomes; append a later checkpoint instead of silently rewriting its date or result.

### 6. Update public guidance

Translate the verified contract into developer actions, inputs/outputs, error handling and clear capability limits. Keep TypeScript payment callers on the documented human-readable amount contract and state where base-unit conversion occurs. Explain approval, submission, confirmation and recovery separately. Update examples, navigation and diagrams together when paths or interfaces change; no invented fields or placeholder proofs in executable examples.

### 7. Update agent knowledge when architectural truth changes

Adjust terminology, the architecture brief or change policy only when identity, ownership, lifecycle, privacy/status or engineering rules materially change. Root `AGENTS.md` remains concise and routes readers to canonical documents. Minor implementation edits do not require a new instruction file. Historical brainstorming/work orders remain labeled and cannot override current code or authorization.

### 8. Validate the affected claims and artifacts

Perform source reconciliation, meaningful example checks, terminology/status searches, local link/navigation checks, MDX compilation and Mermaid parsing as applicable. Compare diagram arrows with actual authorization/CPI order. Record tool versions and limitations. Rendering, remote links, chain state and end-to-end payment need their own evidence; do not imply them from syntax validation. Do not start services or sign/deploy merely to complete documentation validation.

### 9. Record completion and continuation

Report why the change was needed, every created/updated file, inspected sources, exact commands/results and remaining gaps. Keep previous dated reconstruction reports as records; append or link a new bounded report for later work. Update inventories/dispositions for changed pages, but do not treat hash differences as automatic attribution of unrelated user changes. Leave a continuation that can be followed without this conversation or a local-only audit directory.

## Source-to-document impact checklist

| Implementation change | Internal pages to review | Public pages and examples to review |
| --- | --- | --- |
| Program accounts/instructions, asset/reserve accounting | Credit ABI, architecture map, on-chain catalog, invariants, state diagrams, relevant ADR/runbook | Affected layer, lifecycle, security checks, API/account examples, both README diagrams |
| SDK exports/types/payment construction | Source catalog, SDK engineering reference, lifecycle and build/test instructions | Generated module/API reference, SDK payment/configuration/integration guide and typed examples |
| Receiver work/store/auth or database schema | Interfaces, work/state transitions, leases, storage/recovery, operational records | Receiver operator guide, lifecycle, API/status and retry behavior |
| Node verification/proof/authorization | Components, interfaces, cryptography, witness/key setup, failure/recovery and tests | Node operator guide, proof guide, lifecycle, security boundaries and troubleshooting |
| Cranker lease/submission/signature handling | Components, lease/invariants, transport and operational checks | Cranker guide, exact transaction submission and stale-wire recovery |
| TIP identity/creation/routes/schema | Identity and issuance stages, route/account layouts, recovery and migration evidence | TIN/TIP layer, private issuance, resolution API and SDK TIN examples |
| Circuit/encryption/proof/verifier keys | Cryptography, public-input/account ABI, setup experiment, invariants and ADR | GPRU/TCAP layer, hidden-head guide, privacy claims and network readiness |
| HTTP API/interface/errors | Interface catalog plus actual middleware/handlers | Service API, endpoint contracts, authentication, status/error examples |
| Deployment/configuration/dependency version | Existing deploy/setup runbook, technology, dated readiness/evidence | Network status, installation/configuration and supported integration limits |
| DIP/CCTP/external route | Route-specific source/deployment map and experiment | Explicitly supported ingress/integration guide; avoid generalized delivery claims |

API discovery is not effective authorization analysis. Database schema changes require current stored-record and migration review. Proof changes require circuit, key, public-input order, encoding, Memo and all callers to match. Deployment changes require refreshed dated observations before publishing live status; preserve IDs and keys unless a separately authorized implementation changes them.

## Adding documents and records

| Addition | Placement, naming and cross-links | Minimum content |
| --- | --- | --- |
| Component | Extend `laboratory/components.md` first; use a focused lowercase hyphenated page if details justify it; link public layer/operator page | Purpose, owner, interfaces/state, authorization, dependencies, failures, source and tests |
| SDK method | Source-derived `api-reference/sdk/modules/` output plus a guide/example where usage needs explanation | Exact export/subpath, parameter/return types, caller responsibilities, direct errors and behavioral limitations |
| API interface | Internal interface reference and existing public `api-reference/` route | Handler/middleware, request/response, auth, versions, errors, retries/idempotency and sensitive-field boundary |
| Experiment or failed experiment | Next distinct `EXP-YYYYMMDD-short-topic.md` in `laboratory/experiments/`; link its index | Known date, hypothesis, environment, procedure, expected/observed result, failure/root cause, conclusion, evidence and unresolved limits |
| ADR | Next available `ADR-NNN-short-topic.md` in `laboratory/decisions/`; link index and affected implementation | Context, problem, evidenced alternatives, decision/rationale, consequences, status and source/tests; distinguish reconstructed from approved |
| Diagram | Embed in the relevant existing concept/flow page and link the source ABI | Actors, exact direction, authorization, states, public/private boundary and scoped caption |
| Tutorial | Existing public `sdk/` or `developers/` area; lowercase hyphenated MDX route; add navigation where useful | Prerequisites, complete imports/setup, human approval, steps, observable result and failure recovery |
| Troubleshooting | Extend existing public troubleshooting or internal operator/runbook first | Observable symptom/error, actual cause, safe recovery, evidence and exact scope |
| Technology | Extend `laboratory/technology-reference.md` and public current-technology only if behavior/status changes | Dependency/tool, actual role, verified version/source and compatibility/operational limits |

Use the existing experiment and ADR formats instead of inventing a second register. Unknown adoption dates and team approval remain unknown. Include abandoned/inconclusive results when supported by evidence; never invent a failed experiment merely to fill a template. Avoid overwriting an existing identifier; inspect the register before choosing one.

Generated SDK module pages come from [generate-sdk-reference.mjs](references/tooling/generate-sdk-reference.mjs); correct source-extraction logic or source comments through the appropriate task instead of hand-editing generated signatures. Source comments may themselves contain stale claims, so a generated page still needs factual review. Partial snippets must be labeled illustrative; complete runnable examples need meaningful type/runtime validation appropriate to their scope.

## Editing, contradictions, archiving and deletion

Correct an inaccurate current statement at its authoritative page, then update affected summaries, examples, diagrams and references. When two pages disagree, identify the executable enforcer and relevant version/route; preserve distinctions between supported capabilities rather than choosing one based on file age. If evidence is insufficient, label the claim UNVERIFIED and record a concrete next check. Do not accumulate parallel explanations of the same current contract.

A changed payment flow requires actor order, signatures, accounts, state names, funding/settlement distinction and recovery to agree across both documentation trees and README summaries. A terminology change starts in `.codex/architecture-terminology.md` and propagates to current explanations; historical publication names may remain under a dated caption. Deprecation requires a real phase-out decision, and retained migrations need exact purpose and scope. Do not remove supported direct/staged TIN creation because an old prompt prohibited it.

Before deleting a page, identify unique discoveries, failures, decisions, reasoning and implementation evidence. Archive valuable material through the existing historical index and add a prominent status/date/current-reference boundary. Keep original paths where links or research provenance matter. Remove only redundant or irrelevant material after mapping inbound links/navigation and preserving unique content. Repair references and explain the disposition in the completion report; architecture retirement alone is insufficient reason to delete a research record.

Historical prompt bodies may preserve commands, prohibitions and obsolete contracts for provenance. Their top-level boundary must clearly say they are not active work orders, and link current guidance before the original body. A dated checkpoint may be followed by current evidence, but its original result is not replaced with a later test outcome.

## Mermaid style and behavioral validation

Preserve the established README placement near the lifecycle explanation, `flowchart TB` orientation, numbered actor/stage subgraphs, nested program checks and informative quoted labels with `<br/>` line breaks. Use the existing muted green/gold classes: device `#edf3ec`, Receiver `#f6f0df`, Node `#e9efed`, funding/submission `#f2eee6`, programs `#e7eee9`, evidence `#fbf6e9`. Diagrams should expose useful inputs/outputs and gates without reproducing every ABI field.

Show Node verification separately from Mother authority co-signing. Receiver acceptance is coordination, confirmed funding enables settlement verification, and confirmed settlement plus owner recovery establish separate outcomes. A current native-credit diagram must not include epoch vault payout/reimbursement, per-TIN public latest-balance state or first-credit TIP initialization. If those distinct retained capabilities need a diagram, give them their own scoped caption. Preserve authentic historical test diagrams with historical labels. Record visual-rendering checks separately from parsing; Mermaid syntax alone does not verify layout or behavior.

## Offline validation commands

Run from the workspace root. Python/Node must be available. These commands write documentation reports only and do not start a site or submit transactions:

```powershell
python docs/references/tooling/documentation-audit.py inventory
python docs/references/tooling/generate-claim-register.py
python docs/references/tooling/documentation-audit.py check
$taskDocsSyntax = Join-Path $env:TEMP 'trustlink-doc-syntax-20261102'
node docs/references/tooling/validate-doc-syntax.mjs $taskDocsSyntax
git -c core.whitespace=cr-at-eol diff --check -- AGENTS.md .codex README.md tsn-protocol/README.md docs tsn-protocol/tsn-docs
```

The syntax prefix must contain MDX 3.1.1, Mermaid 11.12.3 and JSDOM 26.1.0. If absent, follow the [tooling guide](references/README.md) to install them outside the repository; do not alter application manifests for a prose task. Link/syntax checks include both documentation trees, root instructions, `.codex` Markdown and the two README entry pages. Local checks exclude remote URLs and anchor fragments. Historical code blocks are retained records, not commands to execute.

When SDK contracts/examples change, regenerate the SDK reference and run `node docs/references/tooling/verify-sdk-examples.mjs`. When Node/Receiver/program declarations change, regenerate `generate-interface-reference.py` and review the actual handler/account contracts. `generate-claim-register.py` rejects stale explicit selectors; inspect and correct their evidence rather than deleting rules to force a pass. Avoid rerunning unrelated builds for prose-only edits.

`python docs/references/tooling/verify-source-preservation.py` compares the original local reconstruction baseline where it exists. It refuses a missing baseline; another clone should report that limit or use a baseline genuinely captured before its own edits. Generated build outputs are excluded. Inspect untracked added files for whitespace too, since ordinary Git diff checks do not include them. Report pre-existing unrelated whitespace failures separately and preserve those files.

## Completion checklist and continuation protocol

- Applicable instructions and canonical pages were read; every important implementation claim has a source/enforcer and correct route/version.
- Internal/public impact was reviewed, examples/navigation/diagrams agree, and unrelated documents/work were preserved.
- Implemented, tested, deployed, confirmed, proposed and historical claims are distinct; no retired design directs new implementation.
- Sensitive data is absent; Node/Receiver/Cranker/Mother responsibilities and material privacy limits are explicit.
- Local references resolve, MDX/Mermaid checks pass for the affected scope, and actual commands/results/limitations are recorded.
- Inventories/dispositions and current knowledge pointers are updated where relevant; historical evidence retains its provenance.
- The completion report lists all inspected instruction files, edits, evidence, unresolved questions and ordered next actions without claiming unperformed checks.

A fresh session reads root and any applicable nested instructions, terminology, this manual, then the relevant Laboratory/current-status records. It inspects implementation/tests, maps impact, edits the requested scope, validates and leaves a bounded report. This works without earlier conversations. If local proving evidence or an original audit baseline is missing, record the absence and required verification instead of recreating historical evidence from current files.
