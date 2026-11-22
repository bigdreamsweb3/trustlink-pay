# TSNP Index and Cleanup Guardrails

**Purpose:** source-oriented map for the later reduction of this repository to a
lightweight release. This is an index and cleanup decision aid, not approval to
remove code. It describes the checked-out worktree at the time it was examined;
it is not a deployment inventory or proof that an on-chain program, circuit, or
service is operational.

**Status: CURRENT source map, reconciled 2026-11-02.** Read [architecture](../docs/laboratory/architecture-map.md), [terminology](architecture-terminology.md) and [documentation maintenance](../docs/DOCUMENTATION_MAINTENANCE.md) before acting on this index. Earlier readiness statements were corrected without authorizing cleanup or deployment.

## Rules for using this index

1. Treat executable program, SDK, Receiver, Node, and Cranker code as the
   contract. Use architecture docs as context and verify them against code.
2. Before deleting a symbol, search the whole repository for its callers,
   serialized tags/discriminators, PDA seeds, account layouts, fixtures,
   deployment scripts, and external API consumers. Repeat the search in the
   parent repository when a package may be consumed outside `tsn-protocol`.
3. Keep distinct capabilities separate from the current product/test path.
   In particular, wallet-to-wallet funding commitments are not a synonym for
   the wallet-to-TIP-credit flow and must not be discarded as "old funding".
4. Do not remove deployed program IDs, seeds, instruction discriminants, account
   layouts, user-managed keypairs, deployment configuration, or data migrations
   as ordinary code cleanup. Keep required one-time migrations separate from
   runtime paths.
5. A program ABI or circuit source being present does not mean its path is
   configured, built, deployed, enabled, or verified on chain. Keep those
   statuses distinct in release decisions.
6. Preserve current local work. At index time the worktree was dirty, including
   edits in TIP route hashing, Cranker finalization, Receiver authentication,
   package scripts, and local Receiver state. Confirm author intent and review
   the final diff before using any of those files as deletion candidates.

## Protocol in one view

```text
Sender / owner device + TSN SDK
  ├─ signs payment or TIN-creation authorization
  ├─ encrypts private TIN envelopes locally
  └─ signs the exact TCAP reserve-deposit transaction when funding
            │
            ▼
TSN Receiver (durable work, leases, status, service boundaries)
            │ payload-free wake; authenticated work projections
            ▼
TSN Node (verification, policy, on-chain reads, signed decisions)
            │
            ├─ TIN_OPERATION ──► Cranker ──► TIP staged TIN V1 creation
            ├─ AUTHORIZED_FUNDING ──► Cranker ──► TCAP `deposit_private_funding_v1`
            └─ SETTLEMENT ──► root-selected witness + local proof after funding
                              ──► Cranker + Mother ──► TSNP → TCAP → GPRU

On-chain boundary:
  TIP owns private identity registry + shared route-membership root.
  TCAP owns governed assets, reserves/liabilities, funding commitments,
  and a shared settlement commitment root.
  TSN authenticates Mother authority and CPIs into TCAP.
  GPRU verifies hidden-head/Memo relations with a thirteen-input Groth16 ABI.
```

The Receiver is not the Node or a Cranker. It stores/coordinates work, leases,
and results; the Node makes verification decisions; a Cranker pays transaction
fees and submits the permitted transaction. These are separate trust and
operational boundaries.

## Current source-backed execution paths

### A. Private TIN V1 creation

1. The SDK creates an encrypted identity envelope, encrypted owner-recovery
   envelope, encrypted master-seed envelope, lookup commitment, route fields,
   owner-intent hash, and owner signature. Private plaintext and recovery
   material are device-side concerns.
2. Receiver accepts `TIN_OPERATION` work under a strict field allowlist.
   Node checks the issuance proof and normalizes/authorizes the operation.
3. Cranker verifies the Node attestation, stages encrypted blobs in chunks, and
   submits the owner proof immediately before finalization.
4. TIP validates the owner signature, PDA bindings and route commitments,
   stores the TIN V1 registry and owner-recovery locator, appends the route
   leaf, and advances global state. Expired staging can be closed separately.
5. Resolution uses the private lookup commitment and owner challenge; it is
   not a public TIN-number lookup.

Relevant contracts:

- TIP instruction tags: initialize `0`; active V1 tags `17–22` for create,
  resolve, stage, chunk, finalize, and close. Gaps are intentional; do not
  renumber or assume missing tags are available.
- TIP accounts: global state, `TinV1Account`, `TinV1OwnerRecoveryAccount`,
  temporary `TinV1CreationStaging`, and protocol-wide
  `TipRouteMerkleRootV1` (32-level append-only frontier).
- Route leaf fields are the lookup, GPRU key, and policy commitments. The root
  is consumed by GPRU and TCAP hidden-head verification; it is not disposable
  bookkeeping.

Source: [TIP program](../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/),
[TIP state and layouts](../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs),
[TIP instruction ABI](../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs),
[TIN SDK](../tsn-protocol/sdks/tsn-sdk/src/tins.ts),
[Receiver work contract](../tsn-protocol/services/tsn-receiver/lib/work-contract.ts),
[Node verification](../tsn-protocol/services/tsn-node/server.py),
[Cranker](../tsn-protocol/services/tsn-cranker-op-daemon/scripts/cranker.ts).

### B. Wallet-funded TCAP deposit and source-bound TIN credit

1. SDK creates the sender authorization and a wallet-signed
   `deposit_asset_v2` transaction. The deposit transfers tokens into the
   governed reserve and increases pending liabilities.
2. Receiver accepts only the current `tcap_funded_note_v1` funding mode, validates
   the sender signature, encrypts the full ingress payload for the Node, and
   creates `AUTHORIZED_FUNDING` plus a reference-only `SETTLEMENT` record.
3. Node checks canonical message fields, sender signature/expiry/nonce, the
   signed deposit instruction's program/accounts/mint/amount, and simulates the
   owner-signed transaction before marking funding work verified.
4. Cranker verifies the Node decision and submits the signed funding bytes
   unchanged. Confirmation of funding is not confirmation of a credit or
   settlement.
5. Once funding is confirmed, Node independently rechecks funding and current TIP/TCAP roots, selects a matching witness snapshot, encrypts the owner action Memo, generates and locally verifies the Groth16 proof. Missing witness/key/account prerequisites fail closed. A VERIFIED projection then enables Cranker leasing and Mother-authorized submission.

The proof-shaped on-chain route is: TSN
`register_tcap_credit_authorization_v2` validates Mother authority and the
authorization digest, CPI-calls TCAP `credit_gpru_memo_v1`; TCAP validates the
approved asset, shared root predecessor/sequence, authorization signer,
validity, amount and reserve accounting, then CPI-calls GPRU
`verify_hidden_head_transition_v1`. TCAP advances the shared root/liabilities
only after proof verification. GPRU binds public inputs to canonical TIP/TCAP
roots, action fields, and the immediately following Memo instruction.

**Operational status:** funding and local witness/prover construction are implemented in source. Development circuit/key/local-test evidence is recorded in the [November 2 experiment](../docs/laboratory/experiments/EXP-20261102-hidden-head.md). Current verifier/root initialization, live proof execution/compute, complete funding/settlement and owner recovery still need separate verification. Public deposit-derived nullifiers allow a funding-to-credit link; do not claim full unlinkability.

Source: [Receiver work store](../tsn-protocol/services/tsn-receiver/lib/store.ts),
[Receiver work API](../tsn-protocol/services/tsn-receiver/app/api/cranker/work/route.ts),
[Node settlement gate](../tsn-protocol/services/tsn-node/server.py),
[TSN hidden-head authorization](../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs),
[TCAP hidden-head credit](../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs),
[GPRU hidden-head verifier](../tsn-protocol/programs/gpru/src/hidden_head.rs),
[circuit status and ABI](../tsn-protocol/programs/gpru/circuits/hidden_head_v1/README.md).

### C. Other TCAP funding and value-movement capabilities

These are distinct from the current wallet-to-TIN hidden-head credit path.
Inventory their callers and deployment use before deciding anything about
removal:

- **Wallet-to-wallet / funding commitments:** TCAP
  `deposit_with_funding_commitment_v2` binds a funding identifier,
  destination commitment, nonce/expiry, fee authorization, randomness
  commitment, domain separator and expected commitment while moving tokens
  into reserve accounting. This has separate funding-root/claim/nonce state.
  Preserve it unless the user explicitly retires the capability and a verified
  replacement covers it.
- **Reserve deposit:** `deposit_asset_v2` records actual assets and pending
  liabilities; it is the funding leg used by the current TIN-credit intent.
  Do not conflate this with commitment claims or private transfer credits.
- **Per-TIP liability and one-time credit/transfer:** TCAP has V1
  `TCapTinTipV1`, `TcapOneTimeTip`, liability and seal-based paths. The
  transfer credit specifically moves already-funded transfer-pending reserve
  liability to a recipient liability; it is a separate wallet-to-wallet
  capability. The exact deployed/caller status must be established before
  pruning.
- **Legacy debit/exit:** TCAP exposes distinct debit, exit, payout and liquidity
  instructions. `debit_tcap_gpru_tip_v2` currently calls a fail-closed proof
  gate; that route is not enabled merely because its ABI and tests exist.
  Keep exit/account migration code until its state and deployment obligations
  are checked.
- **Governance/reserve operations:** asset registry, approval/risk state,
  settlement/deposit policy, reserve/vault setup, operational status, pause,
  liability/root initialization, and versioned migrations are administrative
  protocol functions, not redundant product UI.

Source: [TCAP instruction surface](../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs),
[TCAP accounts](../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs),
[funding-commitment deposit](../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v2.rs),
[TCAP funding helpers](../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs),
[one-time transfer credit](../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_one_time_tip_transfer.rs),
[GPRU TIP debit gate](../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_gpru_tip_v2.rs),
[TCAP SDK/scripts/tests](../tsn-protocol/programs/tcap-protocol/).

### D. TSN epoch vault, private payout, and cross-network work

The TSN Anchor program also contains Mother escrow/operator registration,
Cranker vault/treasury funding, private settlement DNA, private payout/refund,
fees, verifier-lamport administration, TCAP authorization CPIs, and exit /
one-time credit bridges. These have distinct accounts, authority checks, and
economic behavior; they are not automatically replaced by the hidden-head
credit ABI. The former EVM destination and proof-middleware integration was explicitly retired on 2026-11-22. Node cross-network admission is disabled, and Cranker has no EVM payout handler. Generic retained EVM contracts are research, not replacement network adapters. Distinct Solana capabilities still require caller/configuration review before removal.

Source: [TSN entrypoints](../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs),
[TSN instruction modules](../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/),
[Node cross-chain route verifier](../tsn-protocol/services/tsn-node/app/services/cross_chain_routes.py),
[Cranker cross-chain adapter](../tsn-protocol/services/tsn-crosschain/),
[Cranker execution service](../tsn-protocol/services/tsn-cranker-op-daemon/).

### E. GPRU

GPRU retains distinct key-proof and hidden-head surfaces; inspect the active ABI and callers:

- `verify_dna_key_proof_v1`: validates a TIP V1 registry/key binding and a
  one-time DNA/ElGamal derivation proof.
- `verify_hidden_head_transition_v1` and
  `initialize_hidden_head_verifier_v1`: shared-root Groth16 proof ABI and
  one-time Mother-authorized verifier setup.

The earlier `apply_credit_transition_v1` runtime was removed; its historical descriptions are not a deletion checklist or current ABI. The hidden-head circuit and Node witness/prover adapters now have development build/key/test evidence. This does not establish independent cryptographic review or enabled debit/exit delivery. GPRU gates host-only helpers off the Solana target. Check the actual retained instruction discriminants and callers before changes; key proofs and hidden-head proofs are not interchangeable.

Source: [GPRU program ABI](../tsn-protocol/programs/gpru/src/lib.rs),
[GPRU legacy instruction validation](../tsn-protocol/programs/gpru/src/program.rs),
[hidden-head verifier](../tsn-protocol/programs/gpru/src/hidden_head.rs),
[circuit](../tsn-protocol/programs/gpru/circuits/hidden_head_v1/main.circom).

## Runtime and package map

| Area | Responsibility | Cleanup notes |
|---|---|---|
| `programs/transfer-identity-protocol/tin-registrar/` | TIP program, Rust instruction builders/processors, route root, identity accounts | Program ID, seeds, tags, account layouts and migration/state compatibility are protocol surface. |
| `programs/tsn/protocol/` | TSN Anchor program and deployment/test harness | Keep Mother, Cranker, vault, epoch, private payout/refund and TCAP CPI capabilities distinct. |
| `programs/tcap-protocol/programs/tcap/` | Governed asset/reserve/funding/settlement program | Preserve commitment deposit and transfer liability semantics; migrations need chain-state review. |
| `programs/tcap-protocol/programs/stable_tcap_faucet/` | Test/dev token faucet | Likely environment-specific, but confirm deployment/test dependencies before excluding. |
| `programs/gpru/` | On-chain proof/key program, Circom circuit, setup/prover scripts | Circuit/key artifacts are generated outputs and must remain out of Git; source ABI is not proof of readiness. |
| `sdks/tsn-sdk/` | TIN, identity encryption, payment auth, TCAP deposit, GPRU, devices, receipts, sessions, threshold and exit helpers | Public exports are API contracts; inspect downstream frontend/tests before removal. |
| `sdks/tsn-cranker-sdk/` | Cranker operator instructions/PDA and setup helpers | Separate from daemon implementation; check consumers before merging or dropping. |
| `services/tsn-receiver/` | Firestore-backed ingress, verification projection, leases, authenticated APIs, receipts, wake notifications | Existing Firestore records and compatibility projections may require one-time migration rather than deletion. |
| `services/tsn-node/` | Python verifier/worker, authorization boundaries, chain reads, threshold and route services | Runtime owns no user keys; Mother authority and Node decision-signing keys are different secrets. |
| `services/tsn-cranker-op-daemon/` | Receiver-driven operator, submits verified funding/TIN work, settlement when enabled | Operator key/config is user-managed; do not clean local state or rotate keys as repo cleanup. |
| `services/tsn-crosschain/` | Cross-network adapters and transaction submission | Distinct network capability; verify deployments and supported networks before excluding. |
| `services/tsn-rpc-gateway/` | Shared Solana JSON-RPC/WebSocket proxy and upstream failover | Deployment credentials belong in service configuration, not checked-in source. |
| `services/tsn-mempool-ui/` | Mempool/operator-facing UI | Classify as product surface or demo only after finding package and deployment callers. |
| `tsn-docs/`, `docs/`, package scripts | Public docs, runbooks, tests, deploy/admin scripts | Some prose is stale; update docs and scripts in the same change as any approved removal. |

Receiver work is versioned and stateful:
`RECEIVED -> NODE_VERIFYING -> VERIFIED/REJECTED -> CRANKER_LEASED ->
SUBMITTED -> CONFIRMED/FAILED`, with lease ownership, expiry and monotonically
increasing state versions. Settlement work is internal-only at ingress.
Receiver's `verifiedPayloadForWork` still reads both a compact payload-delta
representation and a legacy full `verifiedPayload`; that compatibility path
must not be removed until persisted records have been migrated or proven absent.

Cranker auth has challenge/session APIs, signed per-request counters, lease
rate-limits, Node-attestation verification, payload filtering, Node/Mother
settlement-signature proxy, and optional wake delivery. These are service
security boundaries, not disposable wrappers.

## Cleanup disposition (initial)

### Preserve unless the protocol owner explicitly changes the contract

- Program IDs, PDA seed strings, serialized instruction tags/discriminators,
  state/account layouts, root hash semantics, and client encodings.
- TIP V1 registration, private resolution/recovery, staging and append-only
  route membership.
- TCAP `deposit_with_funding_commitment_v2` and associated claim/nonce/root
  machinery: wallet-to-wallet funding commitments are a separate supported
  capability.
- TCAP reserve-accounting invariants, asset governance and explicit migration
  instructions until target-chain state has been inspected.
- TSN Mother/Cranker authorization, vault/epoch behavior, distinct payout and
  refund operations, plus TCAP CPIs that have unique behavior.
- Cranker/Node/Receiver service boundaries, key separation, signed receipts,
  lease fencing, payload minimization and replay/idempotency controls.
- Existing user-controlled program keypairs, `.env` files, local operator
  state, Receiver records, deployment IDs/configuration, and running services.

### Not a live path just because code exists

- Hidden-head Groth16 settlement: root-selected witness and local prover adapters exist. Their configuration, initialized verifier/roots and current end-to-end readiness still need separate evidence; missing prerequisites fail closed.
- Debit/exit proof actions: circuit constraints and instruction entrypoints
  are not equivalent to enabled execution, reserve conservation, payout, or
  successful end-to-end tests.
- Old per-TIP / one-time APIs and legacy GPRU proof ABI: likely candidates for
  eventual reduction, but source-only name/version comparison is insufficient.
  Map every caller and distinct behavior first.

### Potential lightweight-release candidates (require evidence first)

- Unreferenced demo pages, isolated smoke scripts, stale generated artifacts,
  duplicate docs/runbooks, obsolete test fixtures, and unused package exports.
- Compatibility parsing/fallbacks only after proving stored state and external
  callers no longer depend on them.
- Admin/test-only deployments only after verifying no required initialization,
  migration, or local development workflow uses them.

No concrete deletion is approved by this index. For every candidate, record
repository-wide reference results, downstream consumers, test replacements,
state/deployment obligations, and the exact behavior intentionally retired.

## Current evidence and unresolved gaps

- The [current architecture](../docs/laboratory/architecture-map.md) and [credit ABI](../docs/laboratory/credit-abi.md) describe implemented thirteen-input hidden-head credit with local witness/prover adapters. Pinned artifacts and root-selected snapshots are prerequisites, not evidence of live delivery.
- Both README current diagrams were reconciled to Receiver pre-created settlement references, confirmed funding, independent Node proving and TSNP → TCAP → GPRU validation. Their historical examples remain dated records.
- The Node/Cranker service READMEs still require exact route-specific review where they describe epoch/DNA payout. That family is separate from native credit; prose alone does not prove current reachability.
- The [reconciliation register](../docs/laboratory/reconciliation-register.md) records public funding-to-credit nullifier linkage, old TIN migration and other unresolved claims. Do not invent a replacement or delete a unique capability to eliminate a documentation contradiction.
- Source, circuit compilation/key checks, initialized accounts, deployed binary matching and confirmed settlement are distinct evidence. The [status ledger](../docs/DOCUMENTATION_STATUS.md) retains dated observations that may become stale during user-managed deployment.
- Reinspect the current dirty worktree before any cleanup. Preserve user keys, settings, state, services and unrelated edits; this index approves no deletion or Git action.

## Useful verification entry points

- TIP package tests/build: `tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/`
- TCAP tests and SDK: `tsn-protocol/programs/tcap-protocol/tests/` and
  `tsn-protocol/programs/tcap-protocol/tcap-sdk/`
- TSNP program tests: `tsn-protocol/programs/tsn/protocol/tests/`
- SDK tests: `tsn-protocol/sdks/tsn-sdk/tests/`
- Receiver tests: `tsn-protocol/services/tsn-receiver/tests/`
- Node tests: `tsn-protocol/services/tsn-node/tests/`
- Circuit scripts and setup guide:
  `tsn-protocol/programs/gpru/circuits/hidden_head_v1/` and
  `docs/GROTH16-PROVER-AND-KEY-ARTIFACTS.md`

Select the smallest relevant test set after a scoped change. Report host checks,
SBF builds, integration tests, and on-chain observations separately; one does
not imply the others.
