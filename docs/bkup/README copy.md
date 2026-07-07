# TrustLink Pay

TrustLink Pay is an identity-first payment system on Solana.

It lets people send stablecoins to a **10-digit Transfer Identity Number (TIN)** instead of copying and pasting wallet addresses.

The system is built around one idea:

```text
Payment identity should be simple for users, while settlement remains verifiable and harder to trace as a direct wallet-to-wallet graph.
```

## What TrustLink Pay Is

TrustLink Pay combines three active layers:

- **TINS**: the identity layer. It gives users a portable 10-digit payment identity.
- **TSN**: the settlement layer. It separates sender funding from recipient payout.
- **Crankers**: settlement operators. They validate work, execute payouts, and compete for recovery jobs.

The TrustLink Pay app is the first product built on these layers.

## Why It Exists

Most crypto payments begin with a wallet address.

That creates two problems:

1. Wallet addresses are hard for normal people to use.
2. A direct wallet-to-wallet payment can expose a simple public graph.

TrustLink Pay changes the user-facing payment identity from a wallet address to a TIN. TSN then handles settlement in separated steps so a normal payment does not look like a direct sender-wallet-to-recipient-wallet transfer.

## The Simple User Flow

```text
Sender enters recipient TIN
TrustLink resolves the identity
Sender reviews recipient details
Sender authorizes payment
TSN escrow receives the sender-side funds
Crankers validate and execute payout
Recipient receives funds from vault liquidity
Epoch accounting reconciles the system
```

The sender sees a familiar payment experience. The protocol handles settlement, commitments, Cranker work, and recovery behind the scenes.

## Main Concepts

### Transfer Identity System

A TIN is a 10-digit number.

It works like a portable payment identity. A user can share a TIN instead of exposing a wallet address. TINS are designed around a simple privacy principle: people should be discoverable by the identities they choose to share, not by the identities others search for.

Identity fields such as social profiles and legal names can be stored in encrypted form within the registry. Once a sender has a recipient's 10-digit TIN, they can resolve and verify the identity information associated with that TIN. However, someone browsing the public registry cannot easily work backwards from a name, social handle, or public profile to discover the recipient's TIN.

This prevents a public payment identity from becoming a public directory. The TIN becomes the key that unlocks confidence, rather than personal information becoming the key that unlocks the TIN.

### TSN: Transfer Settlement Network

TSN is the settlement layer.

It breaks payment into separate stages:

- sender authorization
- escrow funding
- Cranker validation
- vault payout
- epoch settlement
- recovery if needed

This separation is what gives TrustLink Pay its privacy shape.

### Crankers

Crankers are settlement operators.

They watch the mempool, validate payment work, execute payout work, and participate in recovery races. Crankers earn fees for useful work. The system can use reputation and slashing rules to discourage bad behavior.

### Liquidity Vaults

Vaults provide liquidity for fast payouts.

Instead of waiting for every payment to settle as a single direct path, a Cranker can pay the recipient from vault liquidity. The protocol later reconciles the vault through verifiable settlement records.

### Epoch Reservoirs

An epoch is a settlement window.

Each epoch has an isolated reservoir called a **PEA**. The PEA holds accounting for that epoch. This reduces cross-epoch risk and makes reimbursement easier to audit.

### Commitments

A commitment is a hash.

It proves that a payment record exists without revealing the whole private route. Transfer Settlement Network TSN uses lightweight `PaymentCommitment` accounts, aggregate root hashes, and minimal public challenges so Crankers can prove work without exposing the full payment graph.

## What Privacy Means Here

TrustLink Pay is not claiming that Solana becomes private.

Solana transactions are public. Program accounts are public. If someone has enough context, they can inspect activity.

The privacy goal is narrower and practical:

- do not use wallet addresses as the normal payment identity
- do not expose a simple sender-to-recipient transaction graph
- do not publish phone numbers or social identifiers in clear text
- expose commitments and aggregate proofs instead of full private routes

## Current Program IDs

| Program | Devnet ID                                     |
| ------- | --------------------------------------------- |
| TINS    | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |
| TSN     | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |

## Stable Devnet Toolchain

TrustLink Pay deploys are pinned to the Solana/SBF `1.18.x` builder line and Anchor `0.30.1`.

Run this before deploying either program:

```bash
npm run deploy:lockfiles:stabilize
npm run deploy:doctor
```

The lockfiles intentionally avoid newer crate releases that require Rust edition 2024. This prevents the Solana/SBF 1.18 builder from failing before deployment.

## Repository Map

| Path                     | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `frontend/`              | TrustLink Pay user interface                              |
| `backend/`               | API, payment records, identity records, and notifications |
| `docs/`                  | Product and protocol documentation                        |
| `tins-registrar/`        | TINS on-chain program                                     |
| `tins-sdk/`              | TINS SDK                                                  |
| `tsn/protocol/`          | TSN on-chain program                                      |
| `tsn-sdk/`               | TSN SDK                                                   |
| `tsn-cranker-op-daemon/` | Reference Cranker daemon                                  |
| `tsn-cranker-sdk/`       | Cranker SDK and CLI helpers                               |
| `tsn-mempool-backend/`   | Mempool, epoch coordination, and challenge APIs           |
| `tsn-mempool-frontend/`  | Mempool and epoch explorer                                |

## Start Reading

Start with:

- [Documentation index](./docs/README.md)
- [Start Here](./docs/START-HERE.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [TINS](./docs/TINS.md)
- [TSN commitment settlement](./docs/TSN-COMMITMENT-SETTLEMENT.md)
- [Cranker guide](./docs/CRANKER.md)
- [Liquidity](./docs/LIQUIDITY.md)
- [Deployment](./docs/DEPLOYMENT.md)

## Development Status

TrustLink Pay is pre-launch and currently focused on devnet testing.
