# TrustLink Pay Documentation

TrustLink Pay is an identity-first Web3 payment system on Solana. It gives users a familiar payment experience while giving developers a clear [blockchain payment solution](../README.md) for stablecoin payments, Transfer Identity, PRU routing, and the Transfer Settlement Network (TSN).

The product goal is simple:

Send stablecoins to a 10-digit payment identity instead of a wallet address.

The documentation is part of the product. It should help a developer understand what TrustLink Pay does, why the architecture exists, and how each layer should be integrated without needing a founder explanation.

## Read This First

| Document                                                               | Start here when you want to understand                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [START-HERE.md](./START-HERE.md)                                       | Plain-English onboarding for the whole payment system                             |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                                   | How the product, identity, privacy, settlement, and liquidity layers fit together |
| [TRANSFER-IDENTITY.md](./TRANSFER-IDENTITY.md)                         | TIS, TINs, PRUs, route authentication, and identity resolution                    |
| [TSN.md](./TSN.md)                                                     | TSN payment execution, PRU-funded spending, and fee distribution                  |
| [TSN-TRANSFER-IDENTITY-MEMPOOL.md](./TSN-TRANSFER-IDENTITY-MEMPOOL.md) | How Transfer Identity creation and updates move through TSN Crankers              |
| [API.md](./API.md)                                                     | TrustLink backend APIs vs TSN mempool APIs                                        |
| [DEVELOPER.md](./DEVELOPER.md)                                         | Local development, service boundaries, commands, and integration rules            |
| [SECURITY.md](./SECURITY.md)                                           | Security boundaries, privacy guarantees, and limits                               |
| [FAQ.md](./FAQ.md)                                                     | Direct answers to common product and protocol questions                           |

## Main Concepts

### TIS: Transfer Identity System

TIS is the identity layer.

It gives a user a Transfer Identity that can include a 10-digit TIN, public display name, verified fields, encrypted social links, and PRU commitments. The TIN is easier to read than a wallet address and can carry safe public verification context.

### TSN: Transfer Settlement Network Protocol

TSN means **Transfer Settlement Network**.

It is the settlement layer that coordinates Payment Intents, Escrow Holds, Cranker execution, and Settlement Proofs so the chain does not show a simple sender-wallet-to-recipient-wallet payment graph.

### PRU: Privacy Receiving Unit

A PRU is a privacy receiving route owned by a Transfer Identity.

Every upgraded Transfer Identity has 30 PRUs by default. A TIN balance is the sum of supported token balances across those PRUs. The app can show one spendable balance to the user while TSN keeps the receiving and spending path routed through PRUs.

### Crankers

Crankers are settlement operators.

They watch the TSN mempool, validate payment work, compete for valid settlement jobs, and execute payouts from liquidity vaults. They earn fees when they do useful work and can be restricted or penalized if they act incorrectly.

### Liquidity Vaults

Liquidity vaults hold funds used for fast recipient payouts.

Think of them like settlement reserves. A recipient can be paid quickly from vault liquidity while the protocol later reconciles the sender-side escrow through epoch accounting.

### Epoch Reservoirs

An epoch is a fixed settlement window.

Each epoch has an isolated reservoir called a PEA. A PEA keeps accounting for one settlement window separate from another. This makes reimbursements easier to audit and reduces the risk that one bad window affects the whole system.

### Commitments

A commitment is a public hash.

It proves that a payment or settlement record exists without revealing the full payment route. TrustLink Pay uses lightweight `PaymentCommitment` accounts and aggregate root hashes so public verification does not require exposing the full payment graph.

## Developer Journey

1. Read [Start Here](./START-HERE.md) to understand the product model.
2. Read [Architecture](./ARCHITECTURE.md) to understand layer boundaries.
3. Read [Transfer Identity](./TRANSFER-IDENTITY.md) before touching TIN, PRU, or route-auth code.
4. Read [TSN](./TSN.md) before touching payment execution or Cranker work.
5. Read [Developer Guide](./DEVELOPER.md) before running services locally.
6. Read [Security](./SECURITY.md) before changing signing, route access, or private payload handling.

## Current Program IDs

| Program           | Devnet ID                                     |
| ----------------- | --------------------------------------------- |
| Transfer Identity | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |
| TSN               | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |

## Repository Map

| Path                                  | Purpose                                               |
| ------------------------------------- | ----------------------------------------------------- |
| `frontend/`                           | TrustLink Pay web app                                 |
| `backend/`                            | API, user records, payment records, and notifications |
| `tin-system/tins-registrar/`          | TIS Solana program                                    |
| `tin-system/tins-sdk/`                | Transfer Identity SDK                                 |
| `tsn-protocol/tsn-sdk/`               | TSN SDK used by apps and services                     |
| `tsn-protocol/tsn-cranker-op-daemon/` | Reference Cranker operator daemon                     |
| `tsn-protocol/tsn-cranker-sdk/`       | Cranker SDK and CLI helpers                           |
| `tsn-protocol/tsn-mempool-backend/`   | TSN mempool and epoch coordinator                     |
| `tsn-protocol/tsn-mempool-frontend/`  | Mempool and epoch explorer                            |
| `tsn-protocol/tsn-rpc-gateway/`       | Shared Solana RPC gateway                             |

## Important Limits

TrustLink Pay improves payment privacy by separating settlement steps. It does not make Solana private.

On-chain transactions still exist. Program accounts still exist. Anyone with enough context can inspect public chain data. The design goal is to avoid exposing a clean everyday payment graph during normal use.
