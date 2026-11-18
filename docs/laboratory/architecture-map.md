# Canonical implementation map

**Status: EXPERIMENTAL first-release v1 private credit, reviewed 2026-11-16.** This map follows the current source contract in [ADR-005](decisions/ADR-005-private-amount-and-adaptive-pools.md) and [credit ABI](credit-abi.md). The [November 16 checkpoint](experiments/EXP-20261116-private-credit-epoch.md) verifies two finalized private credits and their complete aggregate accounting; general unlinkability, owner recovery and mixed-action execution remain separate checks. November 2–5 receipts remain evidence for their historical amount-public ABIs.

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
  T --> S[Atomic head/nullifier root and epoch digest]
  S --> O[Owner Memo recovery and reconciliation]
  S --> E[Grouped epoch proof prepared by Node]
  E --> R
  C --> Q[TCAP and GPRU aggregate liability accounting]
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
  A->>A: Sign canonical intent message
  A->>N: POST /intents
  N->>R: Forward authorized funding ingress
  R-->>A: Accepted work identity / pending status
  N->>R: Lease RECEIVED funding
  N->>N: Verify message, recipient, asset and advisory wallet balance
  N->>R: Signed FUNDING_READY decision with private preparation
  A->>N: Owner-authenticated readiness request
  N-->>A: Deposit accounts, amount, expiry and version/commitment
  A->>A: Explicit funding approval with fresh blockhash and wallet signature
  A->>N: Complete the original intent with exact wire/context
  N->>R: Atomic attachment creates RECEIVED settlement reference
  N->>N: Reuse verified authorization to validate and simulate exact deposit
  N->>R: Signed VERIFIED decision
  C->>R: Claim VERIFIED funding
  C->>P: Submit unchanged wallet-signed deposit
  P-->>C: Confirmed reserve deposit
  C->>R: Report CONFIRMED funding
  R->>R: Make linked settlement eligible for Node verification
  N->>R: Lease settlement
  N->>P: Read confirmed funding, TIP root, TCAP state/funding roots and matching verifier
  N->>N: Reconstruct witness, encrypt Memo, prove and verify locally
  N->>R: Signed VERIFIED execution projection
  C->>R: Claim VERIFIED settlement
  C->>N: Request current-lease authorization and exact unsigned message signing
  N->>N: Validate, select final fresh hash and Mother-sign unchanged statement
  N-->>C: Signed V1 message with final hash/lifetime/context
  C->>C: Validate replacement, payer-sign and checkpoint final identity
  C->>P: Submit TSNP authorization call followed by Memo
  P->>P: TSNP -> TCAP -> GPRU checks
  P->>P: Advance shared root and append blinded epoch transcript
  C->>R: Report terminal CONFIRMED result
  A->>P: Verify signature, account state and owner action history
```

The sequence is a source description. Receiver creates the settlement reference at signed funding attachment, and its verification requires confirmed funding. Readiness reserves no funds and does not authorize Cranker execution. Node cannot prepare a usable settlement without pinned proving artifacts, root-matching witness snapshots and a matching initialized verifier; funding confirmation alone does not confer settlement authorization.

Node's authorization response binds the exact verified transition to Receiver's current lease ID/version/expiry and includes Cranker's required kind. The earlier incomplete envelope was corrected and tested locally. Node automatically reconstructs missing TIP membership snapshots from confirmed, indexed creation history before proving. Missing TCAP state snapshots or unavailable TIP history still stop preparation; a guarded authenticated retry can requeue an unsubmitted settlement rejected for missing snapshots or the exact repaired TCAP asset-preflight reason while preserving confirmed funding and requiring fresh Node verification. The diagram describes the source contract; the November 5 finalized reference receipt verifies one credit, with owner recovery still a separate check.

## State and public boundaries

Receiver work uses `RECEIVED`, `NODE_VERIFYING`, `VERIFIED`, `REJECTED`, `CRANKER_LEASED`, `SUBMITTED`, `CONFIRMED`, and `FAILED`. Its `stateVersion`, actor checks and leases control coordination. SDK intent statuses are a separate vocabulary (`pending`, `executed`, `settled`, failure variants); an application must not equate the two sets of strings.

TIP maintains commitment-addressed private identity records, owner recovery accounts and an append-only shared route root. TCAP maintains an asset registry, reserve state, accepted assets, a shared state root and a distinct global funded-note root. A successful `deposit_private_funding_v1` appends a leaf bound to its registered token and observed amount. Hidden-head credit proves that leaf's membership and a deterministic private-secret nullifier before changing the shared state root. GPRU's `GpruHiddenHeadVerifierV2` account stores circuit/key commitments and fourteen IC points for thirteen public inputs; the funding root is appended last.

The [private-credit ABI](credit-abi.md) has one current runtime and separate historical receipt readers. A single confirmed funded note can be credited without pool creation or source-count/release gating. The existing global funding account authenticates current and up to 128 retained root/count pairs; later deposits within that window preserve a proof's funding membership. Retired roots or shared-root/epoch races before signing require fresh verification; signed attempts require exact receipt reconciliation. Signature-only old deposits lack funded membership and require separate handling.

The credit exposes token, blinded amount commitment, roots, nullifier, successor points and encrypted Memo. Its actual amount is private, and its readonly reserve has no per-credit liability mutation. Separate proof-verified accounting publishes a complete 2–64-credit epoch total; sparse epochs or known amounts can still permit inference. The privacy target concerns public observers of TIN activity; Node is intentionally trusted with openings/routes and public wallet funding is an accepted boundary. Current registry/head correlations and public registration-owner binding still limit unlinkability, as recorded in [cryptography](cryptography.md#visibility-and-trust).

## Distinct instruction families

The TSNP library still exposes epoch-treasury funding, `AcceptedIntent`, Settlement DNA, private payout and refund instructions. They have distinct accounts and authorization requirements. They are not stages of the inspected TCAP hidden-head credit sequence. TCAP still exposes one-time-tip, debit, exit, governance and migration entrypoints; their presence does not establish current runtime reachability or production readiness.

DIP and cross-chain services occupy separate ingress, route and destination-execution boundaries. Circle CCTP is an external integration. A configured destination route, compiled adapter or published research paper does not prove a completed source-to-destination settlement.

## Evidence links

- [Receiver work contract](../../tsn-protocol/services/tsn-receiver/lib/work-contract.ts) and [store transitions](../../tsn-protocol/services/tsn-receiver/lib/store.ts).
- [Node verification and settlement functions](../../tsn-protocol/services/tsn-node/server.py), [witness store](../../tsn-protocol/services/tsn-node/hidden_head_witness.py), and [prover adapter](../../tsn-protocol/services/tsn-node/hidden_head_prover.py).
- [Cranker execution](../../tsn-protocol/services/tsn-cranker-op-daemon/scripts/cranker.ts).
- [TSNP library](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs), [TCAP library](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs), and [GPRU verifier](../../tsn-protocol/programs/gpru/src/hidden_head.rs).
- [Existing TIN issuance flow](../protocol-flows/tin-creation/README.md) and [component records](components.md).
