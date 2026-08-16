# TrustLink documentation

Read these documents in order:

1. [Protocol architecture](./protocol-architecture.md) — TSN infrastructure, Solana foundations, authority boundaries, and runtime responsibilities.
2. [Identity and TIN](./identity-and-tin.md) — the 10-digit payment identity, resolution, public fields, and encrypted boundaries.
3. [ZK-PRU](./zk-pru.md) — protected receiving, spending, device-local derivation, scoped authorization, and privacy limits.
4. [Network and runtime](./network-and-runtime.md) — Receiver, Node, Cranker, programs, PDAs, RPC, validators, and clusters.
5. [Security model](./security-model.md) — authority, secret boundaries, replay, revocation, and known limitations.
6. [Operations and testing](./operations-and-testing.md) — localnet, Devnet, evidence, deployment, and troubleshooting.
7. [Security](./SECURITY.md) — plain-language security principles.
8. [Metadata use and compliance](./META-DATA-USE-COMPLIANCE.md) — data minimization and privacy handling.

- [Cranker operator guide](./CRANKER-OPERATOR-GUIDE.md) - operator keypairs, Mother Escrow PDA derivation, registration, vault setup, and runtime.
- [Service coordination and quota](./service-coordination-and-quota.md) - wake signals, durable work, leases, idle behavior, and resource-aware operations.

Supporting technical references:

- [TSN Transaction Explorer](./tsn-transaction-explorer.md)
- [TSN Private View Lit architecture](./tsn-private-view-lit.md)
- [Lit Protocol in TSN](./lit-protocol-in-tsn.md)
- [TIN master-seed architecture](./tin-master-seed-architecture.md)
- [TSN Receiver, Node, and Cranker architecture](./tsn-receiver-node-architecture.md)
- [Public mentions](./mentions.md)

## Canonical terminology

- **TSN** is the network infrastructure.
- **TIN** is the payment identity and route-discovery system.
- **ZK-PRU** is the protected receiving and spending subsystem inside TSN.
- **TSN Receiver** is the durable ingress, work queue, leases, and status-read service.
- **TSN Node** is the stateless off-chain protocol verifier and processor.
- **Cranker** is the fee-paying leased transaction executor and recipient-funding operator.
- **TSN Program** enforces settlement commitments, leases, replay protection, and token movement on Solana.
- **TSN Escrow** reimburses the Cranker that completes the active settlement lease.
- **CrankerVault** pays the recipient before successful escrow reimbursement.
- **TCAP** is experimental and separate from the current settlement actor.

All diagrams in active documentation use Mermaid. Historical architecture that places user decryption or private-key signing in the Node or Cranker is not normative.
