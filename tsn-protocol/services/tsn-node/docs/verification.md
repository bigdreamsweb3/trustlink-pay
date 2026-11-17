# Modular Node verification record

**Status: VERIFIED only for the scopes below, November 16, 2026.** Available synthetic/component tests, the HTTP/source audit and an isolated loopback startup passed. Live Receiver/prover operation, chain execution and owner payment recovery remain UNVERIFIED. The [architecture](architecture.md), [original assessment](original-assessment.md), [production inventory](../core/component_inventory.json), [active-server contracts](../core/component_contracts.json) and [test mapping](../tests/cases/COMPONENTS.json) identify the reviewed source boundaries.

Evidence paths below are relative to the reviewing machine's `%LOCALAPPDATA%\Temp`. These local logs/JSON files are retained evidence, not published network/deployment results. The earlier workspace-root `protocol-test-runs/node-modular-20261116` records remain unchanged historical baseline artifacts.

## Original and corrected baseline

The initial guarded harness recorded 125 unittest cases, one failure, one setup error, four skips and two passing plain checks. The failure involved the TIP snapshot ordering test, while the transport class setup failed before its remaining cases ran. This initial result remains in workspace-root `protocol-test-runs/node-modular-20261116/baseline-summary.json` and must not be substituted for the corrected original-source comparison.

`node-refactor-baseline-review-20261116-corrected-fileinput/corrected-baseline-summary.json` records the corrected original snapshot: 137 unittest cases, zero failures, zero errors, four skips and both existing plain checks passing. It confirms `immutableSnapshotUnchanged=true` and `workingSourcesUnchangedDuringRun=true`, with 54.227 seconds elapsed. Fixture corrections were confined to copied `test_tip_snapshot_sync.py`, `test_hidden_head_prover.py`, `test_hidden_head_transport.py` and `test_tip_snapshot_auto_sync.py`; they preserve original dependency/source paths and isolate unrelated current funding preconditions in the TIP ordering test.

The corrected harness admitted only the exact normalized Node TypeScript serialization argv/working directory and supplied the same synthetic JSON through a regular stdin file. Original circuit paths were obtained through module metadata. These fixture/harness corrections are explicitly recorded in the JSON; they are not program changes or a claim that the raw initial harness passed.

## Test split and final available suite

`tsn-node-test-split-published-20261116/summary.json` verifies the split tests in the Node working copy: 137 unittest cases, zero failures/errors, four skips and both plain snapshot/handoff checks passing, with 22.699 seconds elapsed. The discoverable suite interfaces preserve original test identities; [COMPONENTS.json](../tests/cases/COMPONENTS.json) maps 231 test/fixture functions to their original suite and line.

The earlier extraction checkpoint at `tsn-node-modular-final-20261116/baseline-summary.json` reports the same results: 137 cases, zero failures/errors, four skips, two passing plain checks and `sourceUnchanged=true`, with 22.35 seconds elapsed. This checkpoint predates the final accounting dependency tests and is retained for comparison; the authoritative final suite is the portable run below. The guarded runners use the existing funded-note native DLL through process-only configuration and admit the existing unsigned TypeScript serialization fixture. No dependency was installed.

The portable [Node-local runner](../testing/README.md) was then verified from `tsn-protocol/services/tsn-node` with:

```powershell
..\..\..\.venv\Scripts\python.exe -m testing.run_suite --report-dir C:\Users\codepara\AppData\Local\Temp\tsn-node-portable-final-20261116 --native-library C:\Users\codepara\Desktop\trust-link\tsn-protocol\programs\gpru\target\node-native-funded-note\release\tsn_gpru_proof_contract.dll
```

`tsn-node-portable-final-20261116/suite-summary.json` reports 141 checks, 137 passing, zero failures, zero errors, four skips, `sourceUnchanged=true` and 20.084 seconds elapsed. Its total includes the original 137 unittest cases, two new accounting dependency tests and the two plain checks as `FunctionTestCase` instances. The [new component family](../tests/cases/epoch_prover_dependencies/) directly tests `_verify_private_coordination_work` and `_authorize_private_coordination` with injected aggregate provers, including witness handoff, existing-proof revalidation, total mismatch and current lease/version gates. These cases keep their own test identities and are not additions to the extracted-original mapping. The scope is synthetic/local component, ASGI and unsigned cross-language serialization behavior with real HTTP blocked.

`tsn-node-portable-final-20261116/original-preservation-summary.json` separately reports 53 saved original files, 53 matches and no mismatches against the immutable pre-refactor snapshot. This confirms preservation of those saved files, while the suite's source hashes confirm that the test run did not modify its current source inputs.

Four opt-in checks remain skipped because matching isolated artifacts were not supplied:

- Hidden-head circuit acceptance and forged-state rejection require an isolated compiled circuit directory.
- Hidden-head local proof and serialized reverification require matching development credit artifacts.
- Aggregate epoch proof, serialized reverification and mutations require matching isolated epoch keys.
- Aggregate circuit rejection of changed total/count/opening/order requires an isolated compiled epoch circuit.

The runner clears opt-in proof variables only in its own process. It does not regenerate keys, build circuits, start services or submit transactions. Pytest was absent in the baseline environment; the known plain checks were included explicitly rather than installing it.

## Whole-Node source and HTTP audit

`tsn-node-modular-final-20261116/architecture-summary.json` records 896 Python files and 625 function/lambda declarations after the accounting dependency changes. It reports empty lists for files containing multiple functions, syntax errors, forbidden production patterns and import-time cycles. The HTTP contract is identical to the original baseline, retaining 15 paths and 18 schemas; the original OpenAPI inventory separately records 16 operations. `main.app` matches `server.app`, and the default runtime representation does not expose configuration values.

The [complete production inventory](../core/component_inventory.json) separates 560 production files/387 authored functions from seven verification-tool files/five functions and 329 test files/233 functions. The 173 function-free production files hold models, constants, class shells, package entrypoints and import facades. All 147 original active-server contract files are present. Named imports, their local targets, direct importing modules, source-interface families and class method bindings are recorded without duplicating the existing detailed server/test contract maps. Directory groups describe family ownership rather than exact historical function provenance; the shared `hlen` implementation serves server, app store and Receiver store, while shared no-op `aclose` serves server/app stores.

Every active-server contract includes a static test-reference record: 29 have explicit direct-call source references, 14 have other references such as imports or patch targets, and 104 have no direct mapping with individual coverage unmeasured. Supporting production functions carry the same distinction in the inventory. Original test identities link [COMPONENTS.json](../tests/cases/COMPONENTS.json), and the new accounting dependency family links its own source files. This records reviewable source relationships without claiming measured function/branch coverage, indirect execution, or successful execution of a patched original implementation.

These observations establish source organization, import/schema integrity and available fixture behavior. They do not certify protocol privacy, production availability, installed external artifacts or consensus/chain acceptance. The inventory records source/import ownership rather than executing imported operations.

## Isolated startup probe

`tsn-node-startup-probe-20261116/startup-summary.json` records the existing `python -u server.py` entrypoint in an isolated loopback process. The probe passed startup/OpenAPI, an empty isolated intent store, an authenticated payload-free wake request and continued process availability after those requests. Its log records successful `/openapi.json`, `/intents` and `/internal/wake` requests.

The probe was rerun after the accounting-prover dependency change and passed the same four checks. It used temporary JSON state, a synthetic worker credential and an external-network block. `userManagedServicesChanged=false` and `chainSigningOrSubmission=false`; `liveReceiverAndProofFlow` is explicitly `UNVERIFIED`. This verifies that the refactored entrypoint can run in that isolated configuration, rather than claiming that the user's configured Receiver, signing keys, native artifacts or chain deployment were exercised.

## Documentation and operator impact

Read-only source/document review covered the internal [operator guide](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/RUN-YOUR-OWN-TSN.md), public [Node role](../../../tsn-docs/operators/tsn-node.mdx) and [service API](../../../tsn-docs/api-reference/services.mdx), alongside current startup/facade, configuration and proving paths. Startup commands, environment precedence/defaults, API/authentication contracts, artifact requirements and proving procedures are unchanged by the structural refactor. The identical OpenAPI comparison and scoped startup support those particular interface findings.

The internal operator guide's archival binding pointer is corrected from `server.py` to `core/configuration.py`; `server.GITHUB_REPO` is a copied public export, not a mutable configuration registry. The Node README's stale `/api/mempool` endpoint documentation is corrected to the existing `/intents` and `/intent-work` routes. These are documentation corrections with no new operating step, environment setting or protocol behavior. Other guide/public prose stays within its existing scope, and the internal installation guide is not newly published or promoted in protocol/community documentation.

The final local documentation check is recorded in `tsn-node-portable-final-20261116/documentation-summary.json`: checked local links resolve, Markdown fences balance and source/document/JSON trailing-whitespace checks pass. Scoped protocol and internal-guide `git diff --check` checks also passed. These format/link checks do not exercise network destinations or runtime behavior.

Live funding/settlement, actual Receiver leases and renewals, complete configured proof execution, Mother signing, chain submission/confirmation, owner recovery and optional Creditcoin execution remain outside the verified scope. Review of this modular pilot can proceed from the retained source, contract maps and scoped results; those operational checks require their own authorized execution and evidence.
