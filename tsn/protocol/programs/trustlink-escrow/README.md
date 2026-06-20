# TrustLink Escrow Program

This is the TSN on-chain program.

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
npm run tsn:program:deploy:checked
```

See `docs/DEPLOYMENT.md` for the current toolchain requirements.
