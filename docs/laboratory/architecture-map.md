# Canonical implementation map

**Status: CURRENT source contract, reviewed 2026-11-02.** This map describes the inspected wallet-to-TIN credit components. Build, local-proof, deployment and end-to-end evidence are separate categories. The [dated readiness experiment](experiments/EXP-20261102-hidden-head.md) preserves its pre-deployment observation; the later [successful TIN run](experiments/EXP-20261102-tin-staged-finalization.md) verifies identity creation. The [Cranker transaction map](cranker-transaction-map.md) records confirmed reserve funding, snapshot recovery and the locally tested authorization-envelope correction; native settlement remains unverified.

## Repository boundaries

The workspace root is `trust-link`. Independent `.git` boundaries exist at the root, `tsn-protocol`, `research/Trustlink-Research`, and `pitch-deck`. No separate `.git` boundary was found inside `tsn-protocol/tsn-docs` or the individual service directories during this inspection. Some paths are represented in overlapping parent checkouts; inspect the owning checkout before making a Git operation. Package repository metadata and `.gitmodules` are declarations, not proof of a present independent checkout.

The root `.gitmodules` lists Node, mempool UI and epoch-record paths, while package metadata refers to other service repositories. The [docs pull script](../../scripts/pull-tsn-docs.mjs) requires a clean standalone docs checkout and refuses an existing non-standalone directory. It must not be used to refresh this populated documentation tree. The root has no `.github` directory; the inspected protocol checkout contains [a Mintlify trigger workflow](../../tsn-protocol/.github/workflows/trigger-docs.yml), not a documentation correctness pipeline.

## Components and control flow

```mermaid
flowchart LR
  App[Application and sender wallet] --> SDK[TSN SDK]
  SDK --> N[Node HTTP facade]
  N --> R[Receiver durable ingress]
  R --> V[Node lease and verification]
  V --> TIP[TIP identity and shared route root]
  R --> C[Cranker leased execution]
  C --> D[TCAP wallet deposit]
  D --> F[Confirmed funding evidence]
  F --> R
  V --> W[Root-selected witness and local prover]
  W --> R
  C --> M[Mother-authorized TSNP call and Memo]
  M --> T[TCAP credit validation]
  T --> G[GPRU proof verification]
  G --> T
  T --> S[Atomic root and liability update]
  S --> O[Owner Memo recovery and reconciliation]
```

The Node's HTTP facade accepts application intents and forwards them to Receiver. Receiver owns durable coordination, not private balance authority. Node independently resolves the recipient route and verifies funding. Cranker validates Node's signed execution projection and submits the permitted transaction. Mother authority co-signs the inspected settlement; TCAP calls GPRU as part of its own validation. GPRU does not receive custody of reserve tokens.

## Native credit sequence

```mermaid
sequenceDiagram
  participant A as App / wallet
  participant N as Node
  participant R as Receiver
  participant C as Cranker
  participant P as Solana programs
  A->>A: Review TIN, asset, amount, fee and expiry
  A->>A: Sign canonical intent and reserve-deposit transaction
  A->>N: POST /intents
  N->>R: Forward authorized funding ingress
  R->>R: Pre-create internal RECEIVED settlement reference
  R-->>A: Accepted work identity / pending status
  N->>R: Lease RECEIVED funding
  N->>N: Verify signature, recipient, asset and exact deposit
  N->>R: Signed VERIFIED decision
  C->>R: Claim VERIFIED funding
  C->>P: Submit unchanged wallet-signed deposit
  P-->>C: Confirmed reserve deposit
  C->>R: Report CONFIRMED funding
  R->>R: Make linked settlement eligible for Node verification
  N->>R: Lease settlement
  N->>P: Read confirmed funding, TIP root, TCAP root and verifier
  N->>N: Reconstruct witness, encrypt Memo, prove and verify locally
  N->>R: Signed VERIFIED execution projection
  C->>R: Claim VERIFIED settlement
  C->>N: Request current-lease settlement authorization / co-signature
  C->>P: Submit TSNP authorization call followed by Memo
  P->>P: TSNP -> TCAP -> GPRU checks
  P->>P: Advance shared root and liability accounting atomically
  C->>R: Report terminal CONFIRMED result
  A->>P: Verify signature, account state and owner action history
```

The sequence is a source description. The Node cannot prepare a usable settlement without pinned proving artifacts, root-matching witness snapshots and a matching initialized verifier. Receiver pre-creates a settlement reference at funding ingress, but leasing its verification requires confirmed funding. That confirmation does not itself confer settlement authorization.

Node's authorization response binds the exact verified transition to Receiver's current lease ID/version/expiry and includes Cranker's required kind. The earlier incomplete envelope was corrected and tested locally. Missing root-selected snapshots still stop preparation; a guarded authenticated retry can requeue an unsubmitted settlement rejected for missing snapshots or the exact repaired TCAP asset-preflight reason while preserving confirmed funding and requiring fresh Node verification. The diagram describes the source contract, not a completed live credit.

## State and public boundaries

Receiver work uses `RECEIVED`, `NODE_VERIFYING`, `VERIFIED`, `REJECTED`, `CRANKER_LEASED`, `SUBMITTED`, `CONFIRMED`, and `FAILED`. Its `stateVersion`, actor checks and leases control coordination. SDK intent statuses are a separate vocabulary (`pending`, `executed`, `settled`, failure variants); an application must not equate the two sets of strings.

TIP maintains commitment-addressed private identity records, owner recovery accounts and an append-only shared route root. TCAP maintains an asset registry, reserve state, accepted assets and a protocol-wide commitment-root account. Hidden-head credit changes that shared root, not a publicly addressable latest balance per TIN. GPRU's verifier account stores circuit/key commitments and thirteen IC points for twelve public inputs.

The encrypted Memo remains public transaction instruction data. Action kind, token ID, amount, roots, nullifier, successor point, ciphertext and ephemeral point are public proof/statement fields. Sender funding and wallet endpoints are observable. This is a defined privacy boundary, not proof that metadata can never correlate transactions.

## Distinct instruction families

The TSNP library still exposes epoch-treasury funding, `AcceptedIntent`, Settlement DNA, private payout and refund instructions. They have distinct accounts and authorization requirements. They are not stages of the inspected TCAP hidden-head credit sequence. TCAP still exposes one-time-tip, debit, exit, governance and migration entrypoints; their presence does not establish current runtime reachability or production readiness.

DIP and cross-chain services occupy separate ingress, route and destination-execution boundaries. Circle CCTP is an external integration. A configured destination route, compiled adapter or published research paper does not prove a completed source-to-destination settlement.

## Evidence links

- [Receiver work contract](../../tsn-protocol/services/tsn-receiver/lib/work-contract.ts) and [store transitions](../../tsn-protocol/services/tsn-receiver/lib/store.ts).
- [Node verification and settlement functions](../../tsn-protocol/services/tsn-node/server.py), [witness store](../../tsn-protocol/services/tsn-node/hidden_head_witness.py), and [prover adapter](../../tsn-protocol/services/tsn-node/hidden_head_prover.py).
- [Cranker execution](../../tsn-protocol/services/tsn-cranker-op-daemon/scripts/cranker.ts).
- [TSNP library](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs), [TCAP library](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs), and [GPRU verifier](../../tsn-protocol/programs/gpru/src/hidden_head.rs).
- [Existing TIN issuance flow](../protocol-flows/tin-creation/README.md) and [component records](components.md).
