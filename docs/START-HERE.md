# Start Here

This document explains TrustLink Pay without assuming you know Solana.

## What Is TrustLink Pay?

TrustLink Pay is a payment system that lets a person receive money through a 10-digit **Transfer Identity Number**, called a **TIN**.

The TIN is the public identity. The wallet address stays behind the payment system.

## Why It Exists

Crypto payments are still too address-first.

A wallet address is hard to read, hard to verify, and easy to track once it becomes public. TrustLink Pay gives users a simpler payment identity and uses TSN settlement to avoid showing a simple direct sender-to-recipient payment path.

## The Real-World Analogy

Think of a TIN like an account number.

When someone pays a bank account, they do not need to know the bank's internal ledger process. They only need enough information to trust that they are paying the right person.

TrustLink Pay tries to bring that kind of experience to stablecoin payments.

## The Main Parts

### TINS

TINS is the **Transfer Identity Number System**.

It creates and resolves 10-digit TINs. A TIN can have public identity context, such as a display name or verification status. Social links can be encrypted and attached to the identity.

### TSN

TSN is the **Transfer Settlement Network**.

It handles the payment settlement path. It separates sender funding from recipient payout.

### Crankers

Crankers are settlement operators.

They watch for valid work, check that payment instructions have not been tampered with, execute payouts, and compete to recover or reimburse vaults.

### Liquidity Vaults

Vaults hold liquidity used for recipient payouts.

They let the recipient receive funds quickly while the protocol reconciles the sender-side escrow through settlement records.

### Epochs And PEAs

An epoch is a time window for settlement accounting.

Each epoch has a **PEA**, which is an isolated reservoir for that epoch. Keeping epochs separate makes accounting safer and easier to audit.

### Commitments

A commitment is a public hash.

It proves that something exists without revealing everything inside it. TrustLink Pay uses commitments to prove settlement work while keeping private routes out of public records.

## Example Payment Flow

1. Alice enters Bob's TIN.
2. TrustLink resolves Bob's public identity details.
3. Alice reviews the identity and approves the payment.
4. The payment enters TSN as settlement work.
5. A Cranker validates the work.
6. Sender-side funds move into the escrow path.
7. A Cranker pays Bob from vault liquidity.
8. The system records commitments and epoch accounting.
9. Recovery or reimbursement happens through the epoch process if needed.

## What The Public Chain Sees

The chain sees transactions, accounts, and commitments.

The design avoids publishing the full private payment route. It does not claim that all activity is invisible. It reduces the easy graph that would normally connect a sender wallet directly to a recipient wallet.

## What The App Shows

The app should show users:

- the recipient TIN
- the recipient display name if available
- verification status if available
- payment status
- escrow or payout transaction references where appropriate

The app should not expose raw private routing data, phone numbers, or internal Cranker-only payloads.

## Community And Ecosystem

TrustLink Pay is also shaped by public feedback, research, and external discussion.

- [Community Mentions](./MENTIONS.md): meaningful posts, write-ups, and public discussions about TrustLink Pay.

## Where To Go Next

- [Architecture](./ARCHITECTURE.md)
- [TINS](./TINS.md)
- [TSN commitment settlement](./TSN-COMMITMENT-SETTLEMENT.md)
- [Cranker guide](./CRANKER.md)
- [Liquidity](./LIQUIDITY.md)
- [Security](./SECURITY.md)

## Developer Toolchain

Devnet deploys are pinned for stability.

Use Solana/SBF `1.18.x` and Anchor `0.30.1`. Do not deploy with Solana/SBF `3.x` or standalone `cargo-build-sbf 4.x` yet because those builders can emit bytecode devnet rejects.

Before deploying, run:

```bash
npm run deploy:lockfiles:stabilize
npm run deploy:doctor
```

The deploy lockfiles also avoid newer Rust crates that require edition 2024. That keeps builds compatible with the Cargo version bundled inside the Solana/SBF 1.18 builder.

## TSN + Cranker mediated TINS operations

Version: TSN V1 Cranker-mediated TINS operations
Commit reference: current branch worktree

### Summary

Start new TINS work from the TSN Mempool runtime. Direct user-submitted TIN creation is disabled. Owners sign intent hashes, Crankers verify and relay, and TINS enforces owner authority on-chain.

### Implementation notes

Creation uses two transactions: `tin_creation_fee_commitment` in TSN, then `tin_creation_registry` in TINS. Updates use an owner-signed update intent followed by Cranker-submitted `tin_update`.

### Usage examples

```bash
tsn-cranker tins verify-create-intent --intent <INTENT_ID>
tsn-cranker tins submit-create-registry --intent <INTENT_ID>
tsn-cranker tins verify-update-intent --intent <INTENT_ID>
tsn-cranker tins submit-update --intent <INTENT_ID>
```

### Security & privacy considerations

The owner remains the only authority. Crankers only pay and relay transactions. TINS checks owner-signed intent hashes before creating or updating records.

### Testing notes

Run `npm --prefix tins-sdk run build` and `cargo test --manifest-path tins-registrar/program/Cargo.toml --lib` before changing TINS flows.
