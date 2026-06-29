# TrustLink Pay

> Identity-first, privacy-conscious Solana payments using 10-digit Transfer Identity Numbers, verified identity context, and TSN settlement.

TrustLink Pay lets people send stablecoins to a **10-digit Transfer Identity Number (TIN)** instead of copying and pasting wallet addresses.

See what people are saying about the project: [Community Mentions](./docs/MENTIONS.md).

The project is built from one practical belief:

Blockchain payments should feel familiar for normal users while still giving developers verifiable settlement and better privacy design.

## What TrustLink Pay Is

TrustLink Pay combines two main protocol layers:

- **Identity Layer**
  - **TINS**: Transfer Identity Number System. Gives users a portable 10-digit payment identity.
  - **Social verification**: WhatsApp and WhatsApp Business confidence signals for communication, authentication, and recipient checks.
  - **SAS**: Solana Attestation Service. The trust and verification layer we are prioritizing next for verified names, merchants, and compliance attestations.

- **Settlement Layer**
  - **TSN**: Transfer Settlement Network. Separates sender funding from recipient payout.
  - **Crankers**: Settlement operators that validate work, execute payouts, compete for recovery jobs, and keep the network live.

The goal is simple: payments should feel as familiar as sending to a bank account number, while settlement remains verifiable and avoids exposing a clean sender-wallet-to-recipient-wallet graph.

## Why It Matters

Most crypto payments still start with a wallet address.

That creates problems:

1. Wallet addresses are hard for normal users to verify.
2. A direct wallet-to-wallet payment can expose a simple public payment graph.
3. Merchants and creators often have to expose treasury wallets to receive funds.
4. Apps rebuild payment, identity, and settlement logic from scratch.

TrustLink Pay changes the surface:

| Traditional crypto payment               | TrustLink Pay                                                      |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Share a wallet address                   | Share a 10-digit TIN                                               |
| Sender pays directly to recipient wallet | Sender funds a TSN settlement path                                 |
| Recipient wallet is the payment identity | TIN is the payment identity                                        |
| Identity confidence is weak              | Social verification and future SAS attestations improve confidence |
| Apps rebuild infrastructure              | Apps can integrate TINS, SAS, and TSN through SDKs                 |

## How A Payment Works

Sender enters a recipient TIN. TINS resolves the public identity context. Social verification or SAS status is shown when available. The sender reviews the recipient details and authorizes the payment. TSN receives the sender-side escrow funding, Crankers validate and execute settlement work, the recipient is paid through vault liquidity, and epoch accounting reconciles the system.

The sender sees a normal payment experience. The protocol handles settlement, proofs, Cranker work, and recovery behind the scenes.

## The Identity Layer

### TINS

TINS is the Transfer Identity Number System.

A TIN is a 10-digit number that works like a portable payment identity. It lets a user receive payments without exposing a wallet address as their public identity.

TINS is designed to support:

- 10-digit payment identities
- public display context
- encrypted social identity links
- wallet abstraction
- developer-accessible identity resolution
- future wallet-native TIN payments

The long-term idea is that wallets, payment apps, merchant tools, and on-chain products can use TINs as a top layer for safer payment identity.

### Social Verification

TrustLink Pay started with phone-number and WhatsApp confidence because this is how many users already understand payment trust.

Current and planned social verification includes:

- WhatsApp session-code authentication
- WhatsApp notification flows
- WhatsApp Business profile confidence where public business data is available
- encrypted TIN Master Seed and social identity storage
- recipient preview before payment

Phone numbers should help with confidence, not become the main public payment identity. The public payment identity is the TIN.

### SAS

SAS means Solana Attestation Service.

This is the next trust layer we plan to prioritize. SAS can let trusted issuers attach reusable verification credentials to a TIN.

Examples:

- verified legal name
- merchant verification
- business verification
- government or KYC verification
- proof-of-personhood
- risk or compliance attestations

The sender should see enough verified information to trust the recipient, without exposing sensitive documents or private identity data.

## The Settlement Layer

### TSN

TSN is the Transfer Settlement Network.

Identity alone does not create privacy. If a TIN simply resolves to a wallet and the sender pays that wallet directly, the payment graph is still public.

TSN separates settlement into stages:

- sender authorization
- escrow funding
- Cranker validation
- vault payout
- settlement proof
- epoch accounting
- recovery and reimbursement

This separation helps TrustLink Pay reduce direct sender-to-recipient graph exposure while keeping settlement verifiable.

### Crankers

Crankers are settlement operators.

They monitor work, validate payment structure, execute payout work, submit proofs, and compete for recovery jobs. Crankers are part of the protocol's liveness and safety model.

### Liquidity Vaults And Epoch Reservoirs

Vaults provide liquidity for fast recipient payouts.

Epoch reservoirs, also called PEAs, isolate settlement accounting by time window. This makes reimbursement, recovery, and auditing easier to reason about.

## What Privacy Means Here

TrustLink Pay does not claim that Solana becomes private.

Solana transactions and program accounts are public. The goal is narrower and practical:

- do not make wallet addresses the normal payment identity
- do not expose phone numbers or social identifiers in clear text
- do not publish a simple sender-wallet-to-recipient-wallet payment path
- use commitments, vaults, and separated settlement steps instead of one obvious direct transfer graph

This is privacy-conscious settlement design, not impossible privacy marketing.

## What We Learned

TrustLink Pay started from a product question:

> Why should normal users need wallet addresses to send and receive crypto payments?

The early direction used phone-number and WhatsApp confidence because it made payments feel familiar. That helped prove the user experience.

But the research also showed a deeper protocol problem:

- phone numbers are useful for communication, but should not be the permanent public payment identity
- TINs are better as portable payment identities
- SAS is needed for reusable verified-name and trust context
- TSN is needed because identity resolution alone does not protect the payment graph
- Crankers and vaults are needed for separated settlement and fast payouts
- epoch reservoirs are needed for safer accounting and recovery

That journey moved TrustLink Pay from an app idea into payment identity and settlement infrastructure.

## Current Status

### Working Today

- TINS devnet registry
- 10-digit TIN resolution
- TrustLink Pay frontend and backend
- WhatsApp session-code authentication
- TSN mempool
- Cranker settlement daemon
- escrow funding and vault payout flow
- commitment-based settlement direction

### In Progress

- epoch reservoir settlement
- PEA reimbursement flow
- stronger SDK documentation
- encrypted social identity resolution
- production-grade Cranker operator tooling

### Prioritized Next

- SAS verified-name resolution
- merchant and business attestations
- stronger social verification UX
- better wallet-native TIN integration
- expanded SPL asset support

## Milestones

### StableHacks 2026

[StableHacks 2026](https://dorahacks.io/hackathon/stablehacks/detail) - Track: Programmable Stablecoin Payments.

This milestone proved the first end-to-end identity payment path:

- recipient identity preview before payment
- escrow-backed Solana payments
- gasless UX direction
- WhatsApp-based confidence layer
- hardened escrow architecture
- fraud-protection direction

### The Bags Hackathon

[The Bags Hackathon](https://dorahacks.io/hackathon/the-bags-hackathon/detail) - Track: Payments.

This milestone extended the TrustLink payment model toward identity-first SPL asset transfers and wallet-address-free recipient experiences.

### TINS Protocol

TINS became the protocol answer to portable payment identity.

Instead of making a phone number the main payment identity, TrustLink Pay moved toward a 10-digit TIN that wallets and apps can integrate.

### TSN Settlement Network

TSN became the protocol answer to privacy-conscious settlement.

Working progress includes:

- Cranker-sponsored escrow submission
- private vault payout
- proof records
- mempool-first settlement work
- commitment-only settlement records
- epoch-aware accounting
- PEA reservoir design

## Funding, Supporters And Sponsors

TrustLink Pay is being built independently on Solana by a team focused on researching and improving blockchain payment experience.

The project has received support through the Superteam Agentic Engineering Grant program, approved for **200 USDG** to accelerate fraud-protection system development.

Grateful to [@SuperteamEarn](https://twitter.com/SuperteamEarn) and the [@SuperteamNG](https://twitter.com/SuperteamNG) community.

Special thanks to [@NzubeEzudo](https://twitter.com/NzubeEzudo) and [@Harri_Obi](https://twitter.com/Harri_Obi).

TrustLink Pay needs supporters, sponsors, reviewers, and ecosystem partners to move from devnet validation into stronger production-grade infrastructure.

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

Set one shared RPC entry point for the repo with `TSN_SOLANA_RPC_URLS`.
The frontend receives that value automatically at build time, so you only set the shared app-facing env once.

The gateway process reads `TSN_SOLANA_RPC_URLS` to route traffic across Solana RPC providers. Confirm the active selection with `npm run rpc:inspect` and `npm run rpc:gateway:inspect`.

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
| `tsn-rpc-gateway/`       | Standalone Solana RPC gateway project and shared RPC client |

## Start Reading

- [Documentation index](./docs/README.md)
- [Start Here](./docs/START-HERE.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [TINS](./docs/TINS.md)
- [TSN commitment settlement](./docs/TSN-COMMITMENT-SETTLEMENT.md)
- [RPC gateway](./docs/RPC-GATEWAY.md)
- [Cranker guide](./docs/CRANKER.md)
- [Liquidity](./docs/LIQUIDITY.md)
- [Security](./docs/SECURITY.md)
- [Deployment](./docs/DEPLOYMENT.md)

## Development Status

TrustLink Pay is pre-launch and focused on devnet testing.

> TrustLink Pay - TIN-first Solana payments with social confidence, future SAS attestations, and TSN settlement.
