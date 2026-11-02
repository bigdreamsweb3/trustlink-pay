# TrustLink documentation

TrustLink Labs is building foundational infrastructure for the **Internet of
Value** through **TSN**, a hybrid settlement network that combines off-chain
coordination and verification with on-chain authorization and asset settlement.
Its design aims to make value transfer interoperable, identity-aware, and
privacy-preserving across applications and blockchain networks; route
availability and end-to-end proof support must be checked against current
implementation evidence.

Across these guides, the protocol boundary is consistent: **GPRU guards the integrity and privacy of the user's private state presented to TCAP for a balance-changing action; TCAP governs the assets and liquidity and applies authorized transitions atomically.** The native-credit proof hides the recipient TIN route and private predecessor witness from the on-chain statement. The owner retains private recovery/history material. However, Node derives the published nullifier from the public deposit signature and TCAP program ID, so an observer can compute the funding-to-credit link without a secret. Amount, asset, shared roots, successor point, ciphertext, accounts and timing are also visible, and the authorized Node handles private resolution/witnesses. Direct wallet transfers expose their endpoints; confidential debit and exit require separate execution evidence. The implemented source does not establish general unlinkability, owner-only knowledge or completed live settlement. Required artifact/witness settings and matching chain/verifier state remain runtime gates; see the [canonical privacy record](./laboratory/cryptography.md).

For internal team runbooks, start with the categorized [team guide index](./team/README.md).
The public Mintlify documentation for developers, judges, and users is maintained
separately under `tsn-protocol/tsn-docs/`.

## Laboratory and engineering record

Use the [documentation maintenance manual](DOCUMENTATION_MAINTENANCE.md) for source-first changes, internal/public placement, status, diagrams and validation. The [Codex reference index](../.codex/README.md) separates current guidance from historical prompts.

The [Laboratory record](./laboratory/README.md) connects foundations, the [canonical source-backed architecture](./laboratory/architecture-map.md), component/function references, cryptography, invariants, experiments, ADRs and technology roles. [Documentation status](./DOCUMENTATION_STATUS.md) records reviewed coverage and outstanding claims; the [historical archive](./historical-archive/README.md) preserves superseded designs at their original paths.

## Documentation boundary

Mintlify contains the public protocol/SDK handbook, testing, service API and operator-facing guidance. Detailed source-level investigations, dated experiments, circuit/key setup, deployment evidence and internal runbooks remain in `docs/`. Public pages link those canonical records and distinguish source capabilities from verified network availability.

Read these documents in order:

1. [Current architecture](./CURRENT-ARCHITECTURE.md) — checked-in TSNP, TIP, GPRU, and TCAP contracts, wired credit behavior, and implementation limits.
2. [GPRU hidden-head status](./gpru-tcap-route.md) — the shared-root proof path in source, its public inputs, privacy limits, and missing runtime wiring.
3. [Groth16 proofs in TSN](./GROTH16-ON-TSN.md) — plain-language explanation of the hidden-head proof, keys, privacy boundary, and current runtime status.
4. [GPRU Groth16 prover and key artifacts](./GROTH16-PROVER-AND-KEY-ARTIFACTS.md) — how circuit-specific keys are created and installed, and which artifacts are still missing.
5. [TCAP balance-transition boundary](./TCAP-V2-DEBIT-CREDIT-DESIGN.md) — what current credit code checks and what debit/exit proofs still require.
6. [How TCAP protects reserve funds](./TCAP-FUND-PROTECTION.md) — custody, funded liabilities, GPRU proof checks, solvency, and fail-closed behavior.
7. [TSN whitepaper](./TSN-WHITEPAPER.md) — the normative protocol model, security invariants and planned settlement-domain evolution.
8. [Identity and TIN](./identity-and-tin.md) — the payment identity, owner recovery, resolution and encrypted boundaries.
9. [Protocol architecture](./protocol-architecture.md) — TSN infrastructure, Solana foundations, authority boundaries and runtime responsibilities.
10. [Receiver verification and Cranker settlement](./tsn-receiver-verification-settlement.md) — redacted ingress, verification, leases and exact submission.
   The Node's signed verification receipt is checked by both Receiver and Cranker before execution.
11. [Network and runtime](./network-and-runtime.md) — Receiver, Node, Cranker, programs, PDAs and RPC.
12. [Security model](./security-model.md) — authority, secret boundaries, replay, revocation and limitations.
13. [Operations and testing](./operations-and-testing.md) — Devnet evidence, deployment and troubleshooting.
14. [ZK-PRU retired](./ZK-PRU-RETIRED.md) — architecture history and the replacement rule for implementers.
15. [Security](./SECURITY.md) — plain-language security principles.
16. [Metadata use and compliance](./META-DATA-USE-COMPLIANCE.md) — data minimization and privacy handling.

Supporting references:

- [TCAP values explained](./TCAP-VALUES-EXPLAINED.md) — plain-language meanings and privacy boundaries for credit values.
- [Devnet build and deploy](./DEVNET-BUILD-DEPLOY.md) — reproducible WSL/Ubuntu build, deployment and verification procedure.
- [Historical TCAP credit smoke](./tcap-devnet-credit-smoke.md) — archived per-TIN tip/snapshot fixture; do not use for current TIN credit.

- [Cranker operator guide](./CRANKER-OPERATOR-GUIDE.md)
- [Service coordination and quota](./service-coordination-and-quota.md)
- [TSN Transaction Explorer](./tsn-transaction-explorer.md)
- [TSN Private View](./tsn-private-view-lit.md)
- [Lit Protocol in TSN](./lit-protocol-in-tsn.md)
- [Historical architecture register](./historical-archive/README.md) — the previously linked master-seed page is absent from this checkout
- [TSN Receiver, Node and Cranker architecture](./tsn-receiver-node-architecture.md)
- [Public mentions](./mentions.md)
- [TIN creation data flow](./TSN-TIN-CRANKER-DATAFLOW.md) — Receiver, Node, Cranker, encryption, validation, and evidence boundaries.
- [Canonical TIN V1 flow](./protocol-flows/tin-creation/README.md) — current Receiver-first issuance, signed Node decision, Cranker lease, staged Solana creation, and completion evidence. Use this instead of historical program-assigned walkthroughs.
- [Devnet evidence capture](./TSN-DEVNET-EVIDENCE-CAPTURE.md) — capture a real Cranker transaction and verify its finalized Solana state.
- [TSN Node keys](./TSN-NODE-KEYS.md) — required credentials, key generation, ownership, and rotation.
- [Receiver storage modes](./team/operations/receiver-storage-modes.md) — local JSON testing versus live Firebase persistence and required boundaries.

## Canonical terminology

- **TSN** is settlement and authorization coordination infrastructure.
- **TIP** is the Transfer Identity Protocol; **TIN** is one 10-digit Transfer Identity Number within TIP.
- **GPRU** is a standalone verifier program; the current twelve-input circuit and local witness/prover adapters are implemented. The November 2 record verifies matching development artifacts and local proofs/builds. Runtime settings, matching initialized verifier and chain execution remain separate gates.
- **Epoch Treasury** coordinates aggregate funding and settlement liability.
- **Mother** provides authorization under the applicable TSNP instruction family; do not infer that epoch `ConfidentialSettlement`/slot instructions are part of the active TIN credit path.
- **Cranker** submits exact leased work and cannot rewrite the authorization.
- **TCAP** is the Transfer Confidential Asset Protocol and governs assets, reserves, and liability accounting. The wired TSN credit path advances a single shared TCAP root after GPRU credit validation; it does not persist a per-TIN latest head. TCAP also contains legacy TIN-tip account/instruction code. The current credit calls TCAP, which invokes GPRU before its own atomic root/liability update.
- **ZK-PRU** is retired historical material only. It is not a live receiving, spending or balance architecture; see [ZK-PRU retired](./ZK-PRU-RETIRED.md).

Confidential debits and exits are not established as working end-to-end by the
current hidden-head source. No active document should describe ZK-PRU as a
receiving wallet, balance container or spending route. Do not describe the
hidden-head design's unlinkability as a verified runtime capability: its
transactions all write the same public TCAP root and expose selected action
fields, while current runtime configuration and confirmed settlement remain separate verification requirements. The shared
root exposes global ordering but is protocol-wide, not a per-TIN identity
reference.

All diagrams in active documentation use Mermaid. Historical material is
labelled explicitly and is not normative for new implementations.

## Review standard

When reviewing a claim, classify it as code evidence, build evidence, Devnet
transaction evidence, or production-readiness evidence. A checked-in helper or
successful simulation is not proof of an on-chain deployment. For any program
change, record the Devnet program ID, upgrade authority, deployment slot,
transaction signature and relevant account state before calling the path live.

## Evidence-first guide standard

Every team guide for a build, deployment, chain adapter, liquidity route, or
production operation must document the experience of running the procedure,
not only the procedure itself. Each guide must separate the expected result
from the observed result and explain the actual difference when they diverge.

## Public production-document rule

Public product, hackathon, whitepaper, Mintlify, and marketing documents must
be production-facing explanations, not implementation discussions. Lead with
the capability available to the reader, the value it provides, the verified
architecture, and the evidence supporting the claim. Keep task lists, rollout
debates, pending gates, placeholder configuration, unresolved implementation
notes, and internal governance mechanics in team runbooks. If a capability is
not live, state the limitation briefly and precisely; do not turn the public
narrative into a build diary. Every public claim remains evidence-backed.

Each run entry should include:

1. **Intent** — the architectural or operational question being tested.
2. **Environment** — network, chain ID, RPC, tool versions, and relevant
   feature flags, without secrets or private filesystem paths.
3. **Command or action** — the exact safe command or console action used.
4. **Expected behavior** — what the architecture predicts should happen.
5. **Observed result** — the real terminal output, explorer state, event, or
   failure that occurred.
6. **Actual difference** — what differed from expectation and what that means.
7. **Evidence** — transaction hashes, explorer links, logs, or account state;
   never replace missing evidence with a placeholder.
8. **Next action** — the smallest corrective or follow-up step.

For other chains, also record the address model, gas asset, stablecoin or
liquidity asset, finality behavior, explorer pair, supported Attestcoin role,
route configuration, executor boundary, and the chain-specific failure modes.
This keeps TSN documentation grounded in settlement routing and
privacy-aware settlement coordination while preserving the distinction that
TSN coordinates settlement infrastructure, while TSNP names its on-chain protocol program.
