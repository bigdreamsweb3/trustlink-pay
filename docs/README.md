# TrustLink Pay Documentation

TrustLink Pay is an identity-first payment system on Solana.

The product goal is simple:

```text
Send stablecoins to a Transfer Identity instead of a wallet address.
```

The protocol keeps the payment experience simple while separating the public parts of a payment from the private parts. It does this with Transfer Identities, TSN settlement, Cranker operators, liquidity vaults, and epoch-based accounting.

## Read This First

| Document | Start here when you want to understand |
| --- | --- |
| [START-HERE.md](./START-HERE.md) | The plain-English overview of the whole system |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How Transfer Identity, TSN, Crankers, vaults, and the app fit together |
| [TINS.md](./TINS.md) | Transfer Identity records, TINs, and identity resolution |
| [TSN-TINS-MEMPOOL-IMPLEMENTATION.md](./TSN-TINS-MEMPOOL-IMPLEMENTATION.md) | How TIN creation and updates move through TSN Crankers |
| [TSN-COMMITMENT-SETTLEMENT.md](./TSN-COMMITMENT-SETTLEMENT.md) | Confidential settlement using commitments and epoch reservoirs |
| [RPC-GATEWAY.md](./RPC-GATEWAY.md) | Shared Solana RPC gateway and upstream routing |
| [CRANKER.md](./CRANKER.md) | What Crankers do and how they are rewarded |
| [LIQUIDITY.md](./LIQUIDITY.md) | Vault liquidity, reimbursements, and recovery |
| [SECURITY.md](./SECURITY.md) | Security boundaries and privacy limits |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | How to build, deploy, and avoid failed deploy buffers |
| [DOCUMENTATION-AUDIT.md](./DOCUMENTATION-AUDIT.md) | What changed in the documentation modernization pass |
| [MENTIONS.md](./MENTIONS.md) | Community Mentions and external discussions about TrustLink Pay |

## Main Concepts

### Transfer Identity System

The Transfer Identity System is the identity layer.

It gives a user a Transfer Identity that can include a 10-digit TIN, public display name, verified fields, encrypted social links, and PRU commitments. The TIN is easier to read than a wallet address and can carry public verification context.

### TSN

TSN means **Transfer Settlement Network**.

It is the settlement layer. It separates the sender funding step from the recipient payout step so the chain does not show a simple sender-wallet-to-recipient-wallet payment graph.

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

## Current Program IDs

| Program | Devnet ID |
| --- | --- |
| TINS | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |
| TSN | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |

## Repository Map

| Path | Purpose |
| --- | --- |
| `frontend/` | TrustLink Pay web app |
| `backend/` | API, user records, payment records, and notifications |
| `tins-registrar/` | TINS on-chain program |
| `tins-sdk/` | TINS SDK |
| `tsn/protocol/` | TSN on-chain program |
| `tsn-sdk/` | TSN SDK used by apps and services |
| `tsn-cranker-op-daemon/` | Reference Cranker operator daemon |
| `tsn-cranker-sdk/` | Cranker SDK and CLI helpers |
| `tsn-mempool-backend/` | TSN mempool and epoch coordinator |
| `tsn-mempool-frontend/` | Mempool and epoch explorer |
| `tsn-epoch-records/` | Epoch records and operational notes |

## Important Limits

TrustLink Pay improves payment privacy by separating settlement steps. It does not make Solana private.

On-chain transactions still exist. Program accounts still exist. Anyone with enough context can inspect public chain data. The design goal is to avoid exposing a clean everyday payment graph during normal use.
