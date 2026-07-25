# TrustLink Pay project journey

TrustLink Pay is being built as identity-first stablecoin payment infrastructure on Solana. This page records verified project milestones and ecosystem support; the protocol documentation describes how the system works today.

## Product direction

The project began with a practical question: why should normal users need to exchange wallet addresses for everyday crypto payments?

TrustLink Pay developed from a familiar payment experience toward a protocol design built around Transfer Identity Numbers, ZK-PRU protected receiving authorization, and TSN settlement. Phone and WhatsApp signals can help users assess recipients, but the TIN is the public payment identity. TSN exists because identity resolution alone does not prevent a simple public wallet-to-wallet payment graph.

## Milestones

### StableHacks 2026

TrustLink Pay participated in StableHacks 2026 in the Programmable Stablecoin Payments track. This stage focused on the identity-payment experience, escrow-backed settlement direction, recipient confidence, and fraud-protection research.

### The Bags Hackathon

TrustLink Pay participated in The Bags Hackathon in the Payments track. This stage extended the identity-first payment model toward SPL asset transfers and wallet-address-free recipient experiences.

### Transfer Identity and TSN

The project evolved toward two protocol-level answers:

- Transfer Identity provides a portable 10-digit TIN for payments and identity resolution.
- TSN provides the settlement workflow for payment intents, ZK-PRU route authorization, Cranker execution, proof records, and epoch-aware accounting.

## Ecosystem support

TrustLink Pay received support through the Superteam Agentic Engineering Grant program, approved for 200 USDG to accelerate fraud-protection system development.

The project is grateful to Superteam Earn, the Superteam Nigeria community, and the reviewers and builders who contributed feedback during this work.

## Current work

TrustLink Pay is under active devnet development. Refer to the [main README](../README.md) for the project overview and [documentation portal](./README.md) for current protocol documentation.
