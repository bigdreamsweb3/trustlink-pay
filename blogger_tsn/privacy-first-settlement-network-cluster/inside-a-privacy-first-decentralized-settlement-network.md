# Inside a Privacy-First Decentralized Settlement Network

**Role:** Technical architecture article
**Suggested slug:** `inside-a-privacy-first-decentralized-settlement-network`
**Suggested labels:** TSN, Architecture, Privacy, Settlement, TIN, GPRU, TCap, Solana, Research
**Primary intent:** Document the TSN architecture with explicit implementation boundaries.

## Required argument

Describe the protocol as a set of separated responsibilities, not as a collection of marketing features. Explain how identity, authorization, protected routing, confidential state, treasury coordination, execution workers, proofs, receipts, and recovery fit together.

## Sections to research

1. Scope and architecture status.
2. TIN identity and ownership commitments.
3. GPRU protected routing and its custody boundary.
4. TCap confidential asset state and current supported operations.
5. Payment intents and authorization policy.
6. Node coordination and Cranker execution.
7. Epoch Treasury and settlement liability.
8. Proofs, commitments, nullifiers, and verification.
9. Receipts, observability, and selective disclosure.
10. Threat model, failure modes, and recovery.

## Evidence required before publishing

- Current protocol specifications and source code.
- Passing protocol tests for each described operation.
- Explicit distinction between deployed, tested, research, and planned components.
- Program IDs, networks, and deployment status verified before inclusion.

## Internal link

Link back to the pillar and the public TSN flow, TIN, and TCap documentation. This article must not claim active SNARK/STARK privacy or complete unlinkability without a tested proof and verification path.
