# TSN Node modular architecture

**Status: CURRENT source organization with scoped offline and isolated-startup verification, November 16, 2026.** The whole-Node audit found no multiple-function files, syntax errors, forbidden production patterns or import-time cycles; the HTTP contract matches the original baseline. The corrected baseline and final available synthetic tests pass with the same four opt-in proof skips. An isolated loopback startup passed, while live Receiver/proving/chain flows remain UNVERIFIED. [Verification](verification.md) records exact results and limits, and the [original assessment](original-assessment.md) preserves the baseline investigation.

The actual service directory is `tsn-protocol/services/tsn-node`. The older `tsn-protocol/tsn-node` path in the assignment names this service but does not identify its present checkout location. This pilot changes the Node's Python organization while preserving its startup interfaces, service/API contracts and distinct protocol capabilities. Other services, SDKs and on-chain programs are outside the implementation scope.

## Directory ownership

The tree below shows the present functional packages and their entry or contract files. Individual functions occupy their own modules below these directories. The [active-server map](../core/component_contracts.json) retains contracts for its 147 original functions; the [production inventory](../core/component_inventory.json) covers all 560 production Python source files, 387 authored functions, named imports, class method bindings and source-interface families. [Test components](../tests/cases/COMPONENTS.json) separately map the 231 test and fixture functions.

```text
tsn-node/
├── AGENTS.md
├── README.md
├── server.py                         HTTP facade and bound public exports
├── main.py                           Alternate application entrypoint
├── core/
│   ├── configuration.py              Active configuration/defaults
│   ├── runtime.py                    Composition root and mutable Node state
│   ├── component_contracts.json       Original active-server function map
│   ├── component_inventory.json       Complete production source/import inventory
│   ├── environment/                  Environment-value normalization
│   ├── lifecycle/                    Initialization and shutdown context
│   ├── worker/                       Receiver work, wake and lease orchestration
│   ├── archive/                      Retained queue epoch/archive behavior
│   └── schemas/                      Active request/response models
├── api/
│   ├── handlers/                     HTTP handler responsibilities
│   └── projection/                   Public intent projection
├── amounts/
│   ├── units/                        Registered decimals and base-unit conversion
│   └── credit/                       Blinded amount commitments/private openings
├── transactions/
│   ├── native/
│   │   ├── accounts/                 TSNP and associated-account derivation
│   │   ├── funding/                  Signed deposit parsing/verification
│   │   ├── serialization/            Shortvec and native V1 message parsing
│   │   ├── validation/               Credit fields, digest and transport checks
│   │   └── signing/                  Inspected Mother-authorized message signing
│   └── records/                      Encrypted owner Memo record handling
├── verification/
│   ├── authorization/                Worker/lease authorization and retained permits
│   ├── intent/                       Canonical intent parsing and binding
│   ├── identity/                     TIP resolution and TIN creation checks
│   ├── signatures/                   Signature decoding and verification
│   ├── receipts/                     Signed Node decision projections
│   ├── credit/                       Current native-credit preparation
│   ├── settlement/                   Stored decision and current-lease validation
│   ├── accounting/                   Separate aggregate accounting coordination
│   └── work/                         Work-kind dispatch and rejection projection
├── networking/
│   ├── receiver/                     Ordered Receiver request transport
│   ├── solana/                       Configured active RPC reads
│   └── liquidity/                    Public CrankerVault scans/cache
├── storage/
│   ├── coordination/                 Active Receiver-backed state selection/keys
│   ├── common/                       Shared compatible hash-size/close methods
│   ├── firebase/                     Explicitly gated isolated-test adapter
│   └── local/                        Explicitly gated locked JSON adapter
├── security/cryptography/             Native GPRU and BabyJubjub operations
├── settlement/
│   ├── witness/                      Root-selected private transition witnesses
│   ├── tip/                          TIP snapshot recovery/publication
│   ├── funding/                      Funded-note/root membership and snapshots
│   ├── accounting/                   Epoch transcript and opening reconstruction
│   └── proving/                      Separate local credit/epoch prover adapters
├── app/
│   ├── configuration/                Original supporting app defaults
│   ├── security/                     Base58, public keys, threshold and route signatures
│   ├── storage/                      Receiver, test stores and encrypted snapshots
│   ├── networking/                   Supporting Solana/registry reads and schemas
│   ├── transactions/                 Retained TCAP/Creditcoin authorization models
│   ├── nodes/attestcoin/              Optional injected Creditcoin receipt workflow
│   └── ...                           Original app import/export facades
├── funding_note.py                   Original public import interface
├── funding_snapshot_sync.py          Original public import interface
├── tip_snapshot_sync.py              Original public import interface
├── hidden_head_witness.py            Original public import interface
├── hidden_head_prover.py             Original public import interface
├── tcap_epoch_prover.py              Original public import interface
├── private_credit_coordination.py    Original public import interface
├── credit_amount.py                  Original public import interface
├── dbrix_transaction_record.py       Original public import interface
├── gpru_crypto.py                    Original public import interface
├── attestcoin_worker.py              Original optional-worker import interface
├── testing/                          Portable offline runner and dedicated guards
├── tests/
│   ├── test_*.py                     Discoverable class and fixture interfaces
│   └── cases/
│       ├── COMPONENTS.json            Original test-to-function mapping
│       ├── <suite>/functions/         One function per original test/fixture file
│       └── epoch_prover_dependencies/ New isolated accounting dependency tests
└── docs/                             Architecture, assessment and verification
```

The functional names follow actual source responsibilities. There is no newly invented debit runtime, node-discovery network or speculative protocol-version layer. Retained account/permit helpers and optional cross-chain adapters keep their own boundaries instead of being relabeled as stages of current native credit.

## Runtime composition and component interfaces

`NodeRuntime` in [core/runtime.py](../core/runtime.py) composes the active function implementations and preserves active configuration from [core/configuration.py](../core/configuration.py). Its `_store`, `_vault_liquidity_cache`, `_receiver_wake_event`, `_private_coordination_pending` and `_vault_liquidity_lock` are explicit instance-owned state. The former module-global state mutators now operate through that instance. Focused cryptographic/prover packages retain their separate existing library cache or async lock, as documented in those packages.

A stateful function accepts `node: Dependencies`. Its local Protocol declares the configuration fields and callables used by that function, while a pure function keeps its direct inputs. Runtime class shells bind the imported implementations, and original public helper names remain bound exports in `server.py`. This permits isolated tests to supply a small structural dependency object without importing the HTTP application. Many current port annotations use `Any` or `Callable[..., Any]`; they identify dependencies but do not provide complete static typing of every nested value.

An implementation module is its documented component entrypoint, with named exports and no wildcard namespace assembly. The original top-level and `app.*` facades import those same implementations. Class/data/constants files can contain no authored function; every class method and helper callback has a separate implementation file. Compatible storage `hlen` and no-op `aclose` methods reuse [storage/common](../storage/common/) through their original method interfaces. The supporting [app packages](../app/README.md) retain their distinct adapters and defaults, including existing limitations, rather than replacing active server contracts with an older app path.

## Major processing boundaries

[API handlers](../api/handlers/) receive typed or validated input, invoke declared dependencies and produce the existing public/error contract. `server.py` keeps route registration, authentication dependencies, validation error handling and CORS composition. [Lifecycle](../core/lifecycle/lifespan.py) initializes the selected store, validates enabled signing prerequisites, handles existing startup epoch work, starts the Receiver worker, cancels its tasks and closes its store on shutdown. Importing a facade does not execute that lifespan.

[Receiver transport](../networking/receiver/) preserves configured endpoint order and existing request/server-error handling. [Worker components](../core/worker/) own wake-driven work selection, lease renewal, cancellation and reporting. [Work verification](../verification/work/) delegates funding, settlement, identity and aggregate-accounting checks to their own components. Receiver remains the durable work/lease authority; Node does not acquire a new queue database through extraction.

[Amounts](../amounts/units/) preserve registered asset decimals and exact integer conversion. [Funding validation](../transactions/native/funding/) checks the signed deposit and its confirmed content, while [native credit preparation](../verification/credit/) resolves current routes/roots, obtains matching membership snapshots and creates the private witness and encrypted Memo. [Proving adapters](../settlement/proving/README.md) retain separate thirteen-input credit and five-input epoch contracts. [Native signing](../transactions/native/signing/) inspects the authorized transaction, rechecks current lease/state, selects its final blockhash and Mother-signs the validated message.

[Accounting coordination](../verification/accounting/) and [epoch reconstruction](../settlement/accounting/README.md) preserve the complete ordered transcript/opening requirement for separate aggregate liability accounting. [Queue archival](../core/archive/) is the retained off-chain archive/rollover capability; it is not the native TCAP accounting epoch. [Public liquidity](../networking/liquidity/) scans CrankerVault state and token balances without substituting operator-private state files. Current chain layout and authority boundaries remain defined by the [credit ABI](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/credit-abi.md).

The [cryptography package](../security/cryptography/README.md), [Memo records](../transactions/records/README.md), [private openings](../amounts/credit/README.md), [TIP snapshots](../settlement/tip/README.md), [funding snapshots](../settlement/funding/README.md) and [witness store](../settlement/witness/README.md) retain their own source/artifact/path and privacy contracts. A public snapshot, candidate witness, recorded decision or returned signature is not chain acceptance or validated owner recovery.

## Using and replacing a component

A pure component can be imported directly without constructing the application:

```python
from amounts.units.ui_amount_to_base_units import ui_amount_to_base_units

base_units = ui_amount_to_base_units("1.23", 6)
assert base_units == 1_230_000
```

For a stateful component, inspect its `Dependencies` Protocol and supply those named members in an isolated fixture, or replace the relevant member on an existing `NodeRuntime` instance. Use `AsyncMock` for an awaited port and a normal callable for a synchronous one. Patch dependencies imported directly by a function in its defining module. Existing `server` helper aliases are bound at import time: changing a copied facade constant or replacing the facade's runtime variable does not automatically rebind every registered handler.

Replace the implementation behind its documented entry module, preserve its signature, errors and caller-visible projection, then verify direct consumers and affected serialization/authorization invariants. Update the component map when an original active-server component's contract or ownership changes, and update the nearest package README. Remove the superseded implementation after the replacement is verified; a retained public import facade supplies an interface, not an old fallback runtime.

Existing test families cover nonce/store atomicity, threshold and route signatures, identity binding, funded-note membership, signed funding parsing, native transport/preconditions/authorization, snapshot recovery, witnesses and aggregate accounting. Their [discoverable interfaces and function components](../tests/cases/README.md) preserve test identities and shared fixtures. Two new [accounting-prover dependency tests](../tests/cases/epoch_prover_dependencies/) directly exercise verification and authorization with injected proof dependencies, including existing-proof, total and current-lease rejection checks. The [portable offline runner](../testing/README.md) discovers these cases, includes the two existing plain snapshot/handoff checks and guards HTTP/subprocess boundaries. Use the smallest relevant family during extraction and the complete available suite at the final checkpoint; real circuit/proof checks require explicit matching isolated artifacts. [Verification](verification.md) records the corrected baseline, final 141-check suite and isolated startup.

## External dependencies and preservation limits

[requirements.txt](../requirements.txt) retains FastAPI, Uvicorn, HTTPX, Firebase Admin, python-dotenv, PyNaCl and cryptography. Additional runtime prerequisites are the configured GPRU native library, matching credit/epoch circuit artifacts and the existing local JavaScript proving/serialization helpers. Optional Attestcoin work uses its supplied cross-chain directory, helper runner, tracker and configured EVM Cranker. Package presence or an import does not establish availability of these external systems.

Configuration loading remains inherited environment, `.env.local`, then `.env`, without overriding an earlier value. Active defaults stay distinct from supporting `app.config`; environment files, keys, IDs and deployment bindings are preserved. Artifact/source resolution remains anchored to the protocol checkout, and relative JSON store paths retain their working-directory meaning. The retained audit establishes HTTP contract equality, while passing synthetic authorization, serialization and state fixtures establish their own scoped behavior; live execution and private owner recovery still require separate evidence.

Read-only review of the internal operator guide, public Node role and service API pages found unchanged startup commands, configuration/defaults, API and proving procedures. The internal guide's archival binding source pointer is corrected to `core/configuration.py`, because `server.GITHUB_REPO` is a copied facade export. README startup commands remain unchanged, while its stale `/api/mempool` endpoint documentation now points to the existing `/intents` and `/intent-work` routes. [Verification](verification.md#documentation-and-operator-impact) records these documentation corrections and the operating-interface findings.
