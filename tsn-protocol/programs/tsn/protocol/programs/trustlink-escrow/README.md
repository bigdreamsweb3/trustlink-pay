# TSNP — Transfer Settlement Network Protocol

This is the on-chain settlement protocol program within the wider **TSN (Transfer Settlement Network)** infrastructure. TSNP validates settlement authorization and coordinates atomic settlement with TCAP. TSN refers to the complete network and its programs, Nodes, Receivers, Crankers, and SDKs.

The Rust crate and Anchor module retain the internal name `trustlink_escrow` for source and ABI continuity. The deployed program ID, keypair, instruction names, and account layouts are unchanged by the TSNP identity.

## What Is This?

The program manages settlement accounts, commitments, vault payout rules, Cranker state, epoch accounts, and recovery or reimbursement instructions.

## Why It Exists

TrustLink Pay needs settlement that is verifiable on Solana without exposing the full private payment graph.

This program provides the on-chain rules for that settlement layer.

## Main Concepts

- `MotherEscrow`: protocol-level settlement configuration
- `Cranker`: registered settlement operator state
- `PaymentCommitment`: lightweight proof that payment work exists
- `EpochAccount`: one settlement window
- PEA: per-epoch reservoir
- PrivacyReceivePDA: receive-side route watched for sweep work

## Build And Deploy

Use the root deploy guard before deploying:

```bash
npm run deploy:doctor
npm run tsn:program:deploy:devnet
```

See `docs/DEPLOYMENT.md` for the current toolchain requirements.

