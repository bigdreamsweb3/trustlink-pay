# Independent signed-funding processing

**Status: CURRENT source change with scoped offline verification, November 25, 2026.** This record replaces the nonpreemptive scheduling in [the November 18 deadline record](FUNDING-DEADLINE-20261118.md). It does not establish loaded-service latency or a live funding/settlement result.

## Trace and intended contract

The supplied Cranker log and retained Receiver records identify work `d4057bdd-1d34-41d0-a20d-8fcebca840ca` (hash fingerprint `b4ed1d7b779beeb0`) and `dd240107-132a-43a2-b2c8-a107d11e7850` (`7fe313205e1d3872`). The first decision was signed at 09:31:50.047 UTC, leased at 09:31:58.704 UTC and refused with 14 blocks remaining. The second decision was signed at 09:34:40.133 UTC, leased at 09:34:52.119 UTC and refused 38 blocks beyond its deadline. Recorded `sendInvoked` is false for each attempt. These are local-record observations, not chain nonexecution proof or an attribution of every delay to CPU. Private payloads, session credentials and signed wires were not copied into this report.

Source already performed authorization and governed-account preparation before owner funding approval, issued an unchanged confirmed blockhash with at least 100 blocks remaining and prioritized one signed deposit between ordinary jobs. Node still awaited ordinary verification/proving/accounting before its next claim, and Cranker still awaited native authorization/submission/confirmation before its next funding claim. The wake handler also awaited epoch rollover before signalling work. These are executable waiting points, although the supplied log lacks the original issuance/attachment/verification-start timestamps needed to assign the observed delay among them.

The intended contract preserves exact owner-approved TCAP funding, Node simulation and signed attestation, Receiver versioned leases, confirmed funding before settlement and one-time spend/root checks. Signed funding receives a separate bounded processing lane at Node and Cranker, while ordinary Node work and native Cranker work remain serialized. No wallet signature is replaced, no twenty-block guard is weakened and no automatic replacement deposit is authorized. Durable nonces would require additional accounts, approvals and cross-layer validation; this correction addresses the existing queue contract without adding that lifecycle.

## Implementation and scope

Node `core/worker/receiver_verification_worker.py` runs as two lifespan tasks with distinct wake events and HTTP clients. Signed verification claims only `AUTHORIZED_FUNDING`/`SIGNED_DEPOSIT`. The ordinary worker prepares one `AUTHORIZATION`, coordinates accounting and claims only nonfunding kinds. Both retain the canonical claim/renewal/simulation/decision pipeline and bounded retry, and drained workers sleep without polling. Authenticated wakes signal both before awaited epoch work. Lifespan shutdown cancels both, including exceptional exits. Claim, verification and report durations provide bounded diagnostics for the next authorized attempt.

Receiver accepts either funding phase only with exactly `["AUTHORIZED_FUNDING"]`, checking the persisted phase during selection, expired-lease reclamation and atomic claim. Existing generic lease ordering, shared-root locks, private projections and signed decisions are preserved. Cranker uses disjoint funding/native loops and independent Receiver sessions; separate sessions preserve monotonic request counters even when replies arrive out of order. Its lease gate admits one operator request every two seconds across both loops, respecting the unchanged thirty-per-minute budget without awaiting another lane's HTTP reply. Each lane completes one item before its next claim.

Source inspection covered current TCAP `deposit_private_funding_v1` accounts/handler, SDK funding request/context and deposit builders, XP signing/attachment, Receiver phase/claim/projection, Node exact-wire verification/simulation and Cranker submission/reporting. Program instructions/account layouts, SDK approvals, IDs, keypairs, private configuration, deployment helpers and storage formats were not changed. Root and protocol README diagrams retain the same actor sequence; service READMEs and canonical component/architecture records document the new scheduling. Internal operating steps remain in [RUN-YOUR-OWN-TSN](../RUN-YOUR-OWN-TSN.md); public role, API and troubleshooting pages were updated without publishing that guide.

## Verification

Baseline Node `testing.run_suite` passed 169 of 173 checks, with zero failures/errors, four existing opt-in proof skips and `sourceUnchanged=true` (140.259 seconds). Final source passed 171 of 175 checks with the same skips, zero failures/errors, unchanged source and 59.04 seconds. Both runs used the existing process-only `--native-library` argument, blocked real HTTP and admitted only the existing unsigned serializer fixture. Reports are `%TEMP%\tsn-funding-isolation-baseline-20261125` and `%TEMP%\tsn-funding-isolation-final-20261125`. These elapsed times are test-run observations, not service performance measurements.

Eight focused Node scheduling checks pass, including funding arriving during blocked ordinary work and wake delivery before slow epoch close. AST parsing covered 969 Python files and found no syntax or multiple-function files; counts/definition lines, the affected contracts and three new test-component entries were updated. Prior import/symbol/cycle audit claims retain their original scope. Receiver passed its nineteen staged-funding checks plus Node renewal, native lease and private-credit coordination checks. Its broader HTTP fixture initially failed on existing TIN-debit pure recovery imports; the fixture now admits only their inspected dependency closure and the hashing module's `node:crypto`, preserving its block on service/database imports. The repaired HTTP regression passes. Receiver `npm run typecheck` and the explicit Cranker TypeScript no-emit check pass.

The final Cranker aggregate passed **40/40** checks in 29.916 seconds, including six new work-lane/admission regressions, exact owner-wire/lifetime checks and existing native signing/transport/receipt/retry checks. Its two source-boundary assertions were updated from loop `continue` to the extracted handler's equivalent early `return`. The first aggregate preceded those fixture updates and had two assertion failures; final runtime behavior and all checks pass. Scoped documentation validation compiled three changed MDX pages, parsed five diagrams including both README entries and checked 343 relative file links across seventeen documents, with zero failures. Whitespace validation passes with CRLF treated as line endings, preserving the repository's current newline conventions. The documentation disposition registry links the later record without promoting experimental/live claims. No Rust/SBF build was required because program and instruction source did not change.

## Operator continuation and limits

The operator stops the prior Receiver, Node and Cranker processes in their own terminals and loads matching source from the repository root with `npm run tsn:receiver:dev`, `npm run tsn:node:dev` and `npm run tsn:cranker:start`. These are three separate terminal commands; this task did not execute them. No gateway/SDK rebuild, environment change, dependency installation, program deployment, state migration or storage reset is required.

Preserve the two original funding work/signature identities and reconcile their chain outcomes before approving replacement funding. A fresh authorized attempt should correlate issuance fingerprint, signed attachment, Node claim/verification/report duration, Cranker `claimMs`/`verifiedAgeMs`, remaining blocks and confirmed signature, followed separately by settlement. RPC/storage delays, long wallet approval, another funding operation and complete CPU/event-loop saturation can still exhaust the normal blockhash lifetime. Hosted storage parity, loaded-service concurrency, fresh funding confirmation, settlement and owner recovery remain unverified. No user-managed service, real transaction signing/submission, deployment, commit or push was performed.

## Scoped file manifest

The implementation, test and component records changed by this task are listed below. Concurrent unrelated repository edits were preserved; this manifest excludes their files.

- `docs/DOCUMENTATION_STATUS.md`
- `docs/RUN-YOUR-OWN-TSN.md`
- `docs/laboratory/architecture-map.md`
- `docs/laboratory/components.md`
- `docs/references/FUNDING-DEADLINE-20261118.md`
- `docs/references/FUNDING-ISOLATION-20261125.md`
- `docs/references/document-review.json`
- `tsn-protocol/services/tsn-cranker-op-daemon/README.md`
- `tsn-protocol/services/tsn-cranker-op-daemon/scripts/cranker.ts`
- `tsn-protocol/services/tsn-cranker-op-daemon/src/receiver/lease-gate.ts`
- `tsn-protocol/services/tsn-cranker-op-daemon/src/receiver/work-loop.ts`
- `tsn-protocol/services/tsn-cranker-op-daemon/tests/confirmed-report.test.ts`
- `tsn-protocol/services/tsn-cranker-op-daemon/tests/lease-gate.test.ts`
- `tsn-protocol/services/tsn-cranker-op-daemon/tests/native-retry.test.ts`
- `tsn-protocol/services/tsn-cranker-op-daemon/tests/work-loop.test.ts`
- `tsn-protocol/services/tsn-node/README.md`
- `tsn-protocol/services/tsn-node/api/handlers/wake_receiver_verification.py`
- `tsn-protocol/services/tsn-node/core/component_contracts.json`
- `tsn-protocol/services/tsn-node/core/component_inventory.json`
- `tsn-protocol/services/tsn-node/core/lifecycle/lifespan.py`
- `tsn-protocol/services/tsn-node/core/runtime.py`
- `tsn-protocol/services/tsn-node/core/worker/README.md`
- `tsn-protocol/services/tsn-node/core/worker/claim_receiver_work.py`
- `tsn-protocol/services/tsn-node/core/worker/receiver_verification_worker.py`
- `tsn-protocol/services/tsn-node/core/worker/verify_and_report_receiver_work.py`
- `tsn-protocol/services/tsn-node/docs/architecture.md`
- `tsn-protocol/services/tsn-node/docs/verification.md`
- `tsn-protocol/services/tsn-node/tests/cases/COMPONENTS.json`
- `tsn-protocol/services/tsn-node/tests/cases/funding_queue/functions/close_slow_epoch.py`
- `tsn-protocol/services/tsn-node/tests/cases/funding_queue/functions/make_ports.py`
- `tsn-protocol/services/tsn-node/tests/cases/funding_queue/functions/process.py`
- `tsn-protocol/services/tsn-node/tests/cases/funding_queue/functions/request.py`
- `tsn-protocol/services/tsn-node/tests/cases/funding_queue/functions/run_cycle.py`
- `tsn-protocol/services/tsn-node/tests/cases/funding_queue/functions/test_fair_order.py`
- `tsn-protocol/services/tsn-node/tests/cases/funding_queue/functions/test_fast_queue_drains.py`
- `tsn-protocol/services/tsn-node/tests/cases/funding_queue/functions/test_funding_during_slow_work.py`
- `tsn-protocol/services/tsn-node/tests/cases/funding_queue/functions/test_message_authorization.py`
- `tsn-protocol/services/tsn-node/tests/cases/funding_queue/functions/test_wake_before_epoch_close.py`
- `tsn-protocol/services/tsn-node/tests/test_funding_queue.py`
- `tsn-protocol/services/tsn-receiver/README.md`
- `tsn-protocol/services/tsn-receiver/lib/work/README.md`
- `tsn-protocol/services/tsn-receiver/lib/work/assert-node-funding-lease-filter.ts`
- `tsn-protocol/services/tsn-receiver/lib/work/claim-work-transaction.ts`
- `tsn-protocol/services/tsn-receiver/lib/work/lease.ts`
- `tsn-protocol/services/tsn-receiver/lib/work/leaseForNode.ts`
- `tsn-protocol/services/tsn-receiver/lib/work/matches-funding-lease-phase.ts`
- `tsn-protocol/services/tsn-receiver/lib/work/reclaim-expired-work-lease.ts`
- `tsn-protocol/services/tsn-receiver/tests/cases/http/rewrite-http-fixture-import.mjs`
- `tsn-protocol/services/tsn-receiver/tests/cases/staged-funding/independent-funding-lanes-test.mjs`
- `tsn-protocol/services/tsn-receiver/tests/cases/staged-funding/signed-funding-filter-race-test.mjs`
- `tsn-protocol/services/tsn-receiver/tests/cases/staged-funding/signed-funding-filter-route-test.mjs`
- `tsn-protocol/services/tsn-receiver/tests/staged-funding.test.mjs`
- `tsn-protocol/tsn-docs/api-reference/services.mdx`
- `tsn-protocol/tsn-docs/operators/tsn-node.mdx`
- `tsn-protocol/tsn-docs/sdk/troubleshooting.mdx`

## Later transport/resource checkpoint

The [local Node relay checkpoint](LOCAL-NODE-RELAY-20261125.md) replaces direct Receiver callbacks with durable encrypted request/reply jobs and adds local cache/resource controls. This record retains the earlier funding-lane timing and failure evidence; those source checks do not establish hosted relay deployment or current hardware performance.
