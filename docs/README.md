# TrustLink Pay | Transfer Settlement Network (TSN) Documentation

> Identity-first Solana payments using TIN payment identity, ZK-PRU protected receiving authorization, and the Transfer Settlement Network.

TrustLink Pay is an identity-first Web3 payment system on Solana. It gives users a familiar payment experience while giving developers a clear [blockchain payment solution](../README.md) for stablecoin payments, TIN identity, ZK-PRU route authorization, and the Transfer Settlement Network (TSN).

See what people are saying about the project: [Community Mentions](./docs/MENTIONS.md).

The product goal is simple:

Send stablecoins to a 10-digit payment identity instead of a wallet address.

The documentation defines TrustLink Pay's product model, protocol architecture, integration boundaries, security assumptions, and operator workflows.

## Read This First

| Document                                                               | Start here when you want to understand                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [START-HERE.md](./START-HERE.md)                                       | Plain-English onboarding for the whole payment system                             |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                                   | How the product, identity, privacy, settlement, and liquidity layers fit together |
| [TRANSFER-IDENTITY.md](./TRANSFER-IDENTITY.md)                         | TIP, TINs, ZK-PRU route authorization, and identity resolution                    |
| [TSN.md](./TSN.md)                                                     | TSN payment execution, ZK-PRU-authorized spending, and fee distribution           |
| [TSN-DEVICE-AUTHORIZATION.md](./TSN-DEVICE-AUTHORIZATION.md)             | User-owned device keys, TINS owner verification, sessions, and proof of possession |
| [TSN-PRIVATE-VIEW-LIT.md](./TSN-PRIVATE-VIEW-LIT.md)                   | SDK-owned Lit renderer, closed Shadow DOM, threat model, and integration contract  |
| [TSN Private View research paper](https://github.com/Trustlink-Labs/Trustlink-Research/tree/main/papers/TLR-008) | Device-authorized Lit and canvas rendering, security analysis, and conformance requirements |
| [TSN-TRANSFER-IDENTITY-MEMPOOL.md](./TSN-TRANSFER-IDENTITY-MEMPOOL.md) | How Transfer Identity creation and updates move through TSN Crankers              |
| [API.md](./API.md)                                                     | TrustLink backend APIs vs TSN mempool APIs                                        |
| [DEVELOPER.md](./DEVELOPER.md)                                         | Local development, service boundaries, commands, and integration rules            |
| [SECURITY.md](./SECURITY.md)                                           | Security boundaries, privacy guarantees, and limits                               |
| [FAQ.md](./FAQ.md)                                                     | Direct answers to common product and protocol questions                           |

## Main Concepts

### TIP: Transfer Identity Protocol

TIP is the identity layer.

It gives a user a Transfer Identity that can include a 10-digit TIN, public display name, verified fields, encrypted social links, and ZK-PRU authorization commitments. The TIN is easier to read than a wallet address and can carry safe public verification context.

### TSN: Transfer Settlement Network Protocol

TSN means **Transfer Settlement Network**.

It is the settlement layer that coordinates Payment Intents, Escrow Holds, Cranker execution, and Settlement Proofs so the chain does not show a simple sender-wallet-to-recipient-wallet payment graph.

### ZK-PRU protected receiving identity

ZK-PRU provides purpose-bound protected receiving routes authorized by a Transfer Identity.

Every upgraded Transfer Identity can have a configured set of ZK-PRU handles. A TIN balance is the sum of supported token balances across authorized routes. The app can show one spendable balance while TSN keeps receiving and spending purpose-bound.

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
3. Read [Transfer Identity](./TRANSFER-IDENTITY.md) before touching TIN, ZK-PRU, or route-auth code.
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
| `transfer-identity-protocol/tin-registrar/`          | TIP Solana program                                    |
| `transfer-identity-protocol/tip-sdk/`                | Transfer Identity SDK                                 |
| `tsn-protocol/tsn-sdk/`               | TSN SDK used by apps and services                     |
| `tsn-protocol/tsn-cranker-op-daemon/` | Reference Cranker operator daemon                     |
| `tsn-protocol/tsn-cranker-sdk/`       | Cranker SDK and CLI helpers                           |
| `tsn-protocol/tsn-mempool-backend/`   | TSN mempool and epoch coordinator                     |
| `tsn-protocol/tsn-mempool-frontend/`  | Mempool and epoch explorer                            |
| `tsn-protocol/tsn-rpc-gateway/`       | Shared Solana RPC gateway                             |

## Important Limits

TrustLink Pay improves payment privacy by separating settlement steps. It does not make Solana private.

On-chain transactions still exist. Program accounts still exist. Anyone with enough context can inspect public chain data. The design goal is to avoid exposing a clean everyday payment graph during normal use.
