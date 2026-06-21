# Protocol Overview

This document explains the active TrustLink Pay protocol in plain English.

## What Is This?

The protocol is the set of rules that connect TINS identity, TSN settlement, Cranker work, vault liquidity, and epoch accounting.

It is designed so apps can offer simple TIN-based payments while the settlement layer avoids exposing a direct sender-to-recipient graph.

## Why It Exists

The system needs to solve four problems at the same time:

1. Users need simple payment identities.
2. Recipients need confidence that they are being paid.
3. Settlement must be verifiable.
4. Public records should not reveal more than necessary.

## How It Works

### Identity

The recipient is identified by a TIN.

The app resolves that TIN and displays public identity information before the sender approves payment.

### Authorization

The sender authorizes payment work.

This authorization must bind the important details: sender, recipient route, amount, token, nonce, expiry, and commitment data.

### Mempool

The TSN mempool receives pending work.

It is not a public chain. It is a coordination layer that helps Crankers find work, validate it, and prepare settlement.

### Escrow

Sender-side funds enter a TSN-controlled escrow path.

The escrow step is separate from the recipient payout step.

### Payout

The recipient can be paid from liquidity vaults.

This gives a fast user experience and avoids making the sender escrow transaction the same event as the recipient payout.

### Commitments

The system records commitments, not full private routes.

These commitments are hashed records that allow later verification without revealing every private detail.

### Epoch Settlement

Payments are grouped into epochs.

Each epoch uses an isolated PEA reservoir, aggregate roots, and public challenge data. Crankers race to submit valid recovery or reimbursement work.

## Example Flow

TIN is resolved. The sender authorizes the payment. The intent enters the mempool. A Cranker validates the intent, escrows the funds, opens the `PaymentCommitment`, executes recipient payout from vault liquidity, produces the epoch aggregate root, releases the challenge data, and competes for valid recovery or reimbursement work.

## Security Considerations

- All payment work must be checked for tampering.
- Expired work must be rejected.
- Nonces and commitments must prevent replay.
- Crankers should earn claim or reputation credit only for valid work.
- Public challenge data must be minimal.
- Payout and recovery should not expose the full payment graph.

## Important Limits

The protocol improves privacy by separation and commitments. It does not remove Solana's public nature.

On-chain accounts and transactions remain visible.

## Technical Details

| Area | Current component |
| --- | --- |
| Identity | TINS program and SDK |
| Settlement | TSN program and SDK |
| Coordination | TSN mempool backend |
| Operation | Cranker daemon and SDK |
| User state | TrustLink backend |
| User experience | TrustLink frontend |
