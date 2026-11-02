# ADR-001: keep authority separate from coordination

**Status: reconstructed CURRENT implementation decision. Review date: 2026-11-02. Original adoption date: not established.**

## Context and problem

A payment moves through an application, durable Receiver work, Node verification, Cranker submission and program execution. Treating these actors as interchangeable would allow an accepted request or worker lease to be mistaken for owner approval or settlement proof.

## Decision and rationale

Sender/owner signs the exact intended message and applicable transaction. Receiver controls durable acceptance and leases. Node verifies work and signs an allowlisted execution projection. Cranker independently verifies that projection and submits permitted bytes. Mother authority authorizes the inspected TSNP credit; TCAP/GPRU enforce accounting/proof requirements. This is supported by executable contracts rather than a claim of decentralized verification consensus.

## Alternatives and consequences

Earlier epoch/slot and ZK-PRU narratives describe different mechanisms, but no complete comparative decision log was found. Their existence does not prove that a centralized Receiver, permissionless verification or alternative signing model was formally evaluated. This ADR records the present boundary, not invented alternatives.

Two signatures or roles managed by one operator still have distinct contracts. A lease can expire while a chain transaction succeeds; reconciliation must use the signature. A Cranker cannot alter an owner-signed deposit blockhash. Receiver acceptance does not prove Node verification or settlement.

Evidence: [work contract](../../../tsn-protocol/services/tsn-receiver/lib/work-contract.ts), [Node attestation verification](../../../tsn-protocol/services/tsn-receiver/lib/node-verification.ts), [Node server](../../../tsn-protocol/services/tsn-node/server.py), [Cranker](../../../tsn-protocol/services/tsn-cranker-op-daemon/scripts/cranker.ts), and [TSNP credit](../../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs).
