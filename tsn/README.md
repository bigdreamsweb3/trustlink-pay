# Transfer Settlement Network (TSN)

TSN is a privacy-preserving transfer settlement layer.

It routes payments through temporary escrow and private claim flows instead of direct wallet-to-wallet transfers.

TSN is protocol infrastructure for TINS and any external application that needs private settlement execution.

## Purpose

TSN provides:

1. Intent-based settlement lifecycle
2. Deterministic executor (Cranker) lease assignment
3. Proof of Payment (PoP) validation
4. Vault-based liquidity execution
5. Epoch reimbursement and fee distribution
6. Privacy-aware settlement boundaries

## Why TSN Exists

Direct wallet-to-wallet transfers expose routing relationships and create unnecessary privacy leakage.

TSN separates:

- sender lock flow
- recipient claim flow
- executor payout flow
- reimbursement flow

This separation enables private settlement coordination with verifiable on-chain state transitions.

## Protocol Roles

- Integrator app: creates intents and submits claim requests
- Recipient: claims through private claim flow
- Cranker: acquires lease, executes settlement, submits proof
- Liquidity provider: funds vault positions
- Epoch authority: finalizes reimbursement windows

## Settlement Flow

1. Integrator submits payment intent.
2. Funds lock in temporary escrow path.
3. Claim request enters settlement queue.
4. One Cranker acquires execution lease.
5. Cranker executes payout path and submits proof.
6. Intent is finalized for epoch accounting.
7. Epoch settlement reimburses and distributes fees.

## Security Model

TSN enforces:

- single active lease holder per claimable intent
- vault custody through PDAs
- proof submission tied to lease ownership
- funder-scoped withdrawal permissions for liquidity positions

Validated behavior:

- non-funder withdrawals are rejected
- funder withdrawals are limited to that funder position
- settlement execution depends on intent and lease state

## Repository Layout

- `tsn/protocol`: Anchor on-chain workspace
- `tsn/src`: protocol TypeScript modules
- `tsn/scripts`: operator/setup scripts
- `tsn/cranker-sdk`: Cranker SDK package

## Protocol Workspace Commands

```bash
cd tsn/protocol
anchor build
anchor deploy
```
