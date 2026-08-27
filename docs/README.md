# TrustLink documentation

Read these documents in order:

1. [Current architecture](./CURRENT-ARCHITECTURE.md) — canonical TIN, privacy-receiving root, GPRU, TSN Epoch Treasury, Mother, TCAP (Transfer Confidential Asset Protocol) and encrypted snapshots.
2. [TSN whitepaper](./TSN-WHITEPAPER.md) — the normative protocol model, security invariants and planned settlement-domain evolution.
3. [Identity and TIN](./identity-and-tin.md) — the payment identity, privacy-receiving root, resolution and encrypted boundaries.
4. [Protocol architecture](./protocol-architecture.md) — TSN infrastructure, Solana foundations, authority boundaries and runtime responsibilities.
5. [Receiver verification and Cranker settlement](./tsn-receiver-verification-settlement.md) — redacted ingress, verification, leases and exact submission.
6. [Network and runtime](./network-and-runtime.md) — Receiver, Node, Cranker, programs, PDAs and RPC.
7. [Security model](./security-model.md) — authority, secret boundaries, replay, revocation and limitations.
8. [Operations and testing](./operations-and-testing.md) — Devnet evidence, deployment and troubleshooting.
9. [ZK-PRU retired](./ZK-PRU-RETIRED.md) — architecture history and the replacement rule for implementers.
10. [Security](./SECURITY.md) — plain-language security principles.
11. [Metadata use and compliance](./META-DATA-USE-COMPLIANCE.md) — data minimization and privacy handling.

Supporting references:

- [TCAP values explained](./TCAP-VALUES-EXPLAINED.md) — plain-language meanings and privacy boundaries for credit values.
- [Devnet build and deploy](./DEVNET-BUILD-DEPLOY.md) — reproducible WSL/Ubuntu build, deployment and verification procedure.
- [Devnet TCAP credit smoke](./tcap-devnet-credit-smoke.md) — account gates, bootstrap, simulation and evidence requirements.

- [Cranker operator guide](./CRANKER-OPERATOR-GUIDE.md)
- [Service coordination and quota](./service-coordination-and-quota.md)
- [TSN Transaction Explorer](./tsn-transaction-explorer.md)
- [TSN Private View](./tsn-private-view-lit.md)
- [Lit Protocol in TSN](./lit-protocol-in-tsn.md)
- [TIN master-seed architecture](./tin-master-seed-architecture.md) (historical compatibility note)
- [TSN Receiver, Node and Cranker architecture](./tsn-receiver-node-architecture.md)
- [Public mentions](./mentions.md)

## Canonical terminology

- **TSN** is settlement and authorization coordination infrastructure.
- **TIN** is the payment identity and route-discovery system.
- **GPRU** is non-custodial authorization and routing; it never holds funds.
- **Epoch Treasury** coordinates aggregate funding and settlement liability.
- **Mother** creates the one-time TSN ConfidentialSettlement authorization.
- **Cranker** submits exact leased work and cannot rewrite the authorization.
- **TCAP** is the private balance accounting layer: tip credits plus encrypted owner snapshots.
- **ZK-PRU** is retired historical material only. It is not a live receiving, spending or balance architecture; see [ZK-PRU retired](./ZK-PRU-RETIRED.md).

Live confidential debits and exits remain proof-gated and disabled. No active
document should describe ZK-PRU as a receiving wallet, balance container or
spending route.

All diagrams in active documentation use Mermaid. Historical material is
labelled explicitly and is not normative for new implementations.

## Review standard

When reviewing a claim, classify it as code evidence, build evidence, Devnet
transaction evidence, or production-readiness evidence. A checked-in helper or
successful simulation is not proof of an on-chain deployment. For any program
change, record the Devnet program ID, upgrade authority, deployment slot,
transaction signature and relevant account state before calling the path live.
