# TrustLink Labs team guides

This directory is for internal engineering, operations, and release runbooks.
It is not the public Mintlify documentation tree. Public developer, judge, and
user material belongs under `tsn-protocol/tsn-docs/`.

## Categories

- [Architecture](./architecture/README.md) — canonical system boundaries and terminology.
- [Protocol](./protocol/README.md) — TIN, TCap, GPRU, TSNP programs, and settlement rules.
- [Cross-chain](./cross-chain/README.md) — Creditcoin, Attestcoin, destination liquidity, and EVM routes.
- [Operations](./operations/README.md) — Receiver, TSN Nodes, Crankers, environments, and service operation.
- [Testing and releases](./testing/README.md) — Devnet evidence, deployment gates, and release review.
- [Security](./security/README.md) — key handling, privacy-aware settlement coordination, and failure boundaries.
- [Community and route governance](./community/README.md) — route proposals, evidence review, voting, activation, and incidents.

## Documentation rule

Every team process must have a guide. When the implementation or operating
method changes, update the affected guide in the same change. Each guide must
state its scope, prerequisites, exact commands, expected evidence, failure
conditions, and rollback or recovery procedure. Never document simulated
transaction hashes or claim deployment success without observed Devnet/Testnet
evidence.

Team guides may contain implementation and operational detail. Public product,
hackathon, whitepaper, Mintlify, and marketing documents must remain
production-facing: describe shipped capability, user or judge value, verified
architecture, and evidence. Move task lists, rollout debates, pending gates,
placeholder configuration, and unresolved implementation notes into these team
guides instead of exposing them in the public narrative.

Use the canonical distinction: **TSN (Transfer Settlement Network)** is the
complete TrustLink Labs infrastructure; **TSNP (Transfer Settlement Network
Protocol)** is its on-chain settlement protocol program. TIP, GPRU, TCAP, and
DIP retain their distinct protocol roles. Circle's CCTP is an external
cross-chain transfer protocol and should be named only for an actual CCTP
integration. Preserve TIN, Receiver, Node, Cranker, settlement routing, and
privacy boundaries without merging their responsibilities.

## Existing source documents

The existing root-level documents remain available while links are migrated into
these categories. New internal guides should be added to the appropriate
category rather than added to the root of `docs/`.
