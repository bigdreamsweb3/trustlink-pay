# TrustLink documentation

Read these documents in order:

1. [Protocol architecture](./protocol-architecture.md) — TSN as infrastructure,
   Solana foundations, authority boundaries, and runtime responsibilities.
2. [Identity and TIN](./identity-and-tin.md) — the 10-digit TSN payment
   identity, resolution, public fields, and encrypted boundaries.
3. [ZK-PRU](./zk-pru.md) — protected receiving, spending, device-local
   derivation, scoped authorization, and privacy limits.
4. [Execution plan](./execution-plan.md) — canonical route fields,
   commitments, signatures, fees, state, and replay constraints.
5. [Network and runtime](./network-and-runtime.md) — TSN Node, Cranker,
   programs, PDAs, escrow, RPC, validators, and clusters.
6. [Security model](./security-model.md) — authority, secret boundaries,
   delegate checks, replay, revocation, and known limitations.
7. [Operations and testing](./operations-and-testing.md) — localnet, Devnet,
   evidence, test layers, deployment, and troubleshooting.
8. [Implementation status](./implementation-status.md) — what is implemented,
   under migration, disabled, experimental, and not claimed.

Supporting technical reference:

- [TSN Transaction Explorer](./tsn-transaction-explorer.md)
- [TSN Private View Lit architecture](./tsn-private-view-lit.md)
- [Public mentions](./mentions.md)

## Canonical terminology

- **TSN** is the network infrastructure.
- **TIN** is the payment identity and route-discovery system.
- **ZK-PRU** is the protected receiving and spending subsystem inside TSN.
- **TSN Node** is the off-chain verification, reservation, work-queue, and
  status service. “Mempool” is an implementation/history term, not a separate
  product.
- **Cranker** is the fee-paying transaction executor.
- **TSN Program** and **TSN Escrow** enforce and hold settlement state on
  Solana.
- **TCAP** is experimental and separate from the current settlement actor.

All diagrams in active documentation use Mermaid. Historical architecture that
places user decryption or private-key signing in the node or Cranker is not
normative.
