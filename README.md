# TrustLink Pay

> Private stablecoin payments to 10-digit Transfer Identity Numbers. TINS gives users a portable payment identity. TSN settles value through cranker-routed vault flows without exposing a direct sender-to-recipient wallet path.

---

## Overview

TrustLink Pay is an identity-first payment system on Solana.

Instead of asking users to paste wallet addresses, TrustLink Pay lets a sender pay a **10-digit Transfer Identity Number (TIN)**. The TIN is the public payment identity. The wallet address stays behind the protocol boundary.

The system is built around two protocol layers:

- **TINS - Transfer Identity Number System**: the on-chain identity registry for 10-digit wallet-owned payment numbers.
- **TSN - Transfer Settlement Network**: the settlement network that routes payment authorization, escrow, cranker verification, vault payout, and proof.

The result is a payment flow that feels familiar like account-number payments, but settles through Solana infrastructure with stronger wallet privacy.

---

## What Makes TrustLink Pay Different

Most crypto payment products still expose wallet addresses as the main identity.

TrustLink Pay changes the surface:

| Traditional Crypto Payment                           | TrustLink Pay                                          |
| ---------------------------------------------------- | ------------------------------------------------------ |
| Share a wallet address                               | Share a 10-digit TIN                                   |
| Sender pays directly to recipient wallet             | Sender funds a private TSN escrow path                 |
| Recipient wallet is easy to inspect from sender flow | Recipient payout is separated through vault settlement |
| Apps rebuild payment logic themselves                | Apps integrate TINS and TSN through SDKs               |
| Identity is address-first                            | Identity is TIN-first                                  |

TrustLink Pay is not trying to hide that Solana transactions exist. It is designed so the normal payment journey does not expose a clean sender-wallet-to-recipient-wallet graph. To follow settlement, an observer needs specific transaction context, vault context, or program-level knowledge.

---

## Core Architecture

TrustLink Pay is made of three connected surfaces.

### 1. TINS Identity

TINS gives users a permanent 10-digit Transfer Identity Number.

A TIN can be used by:

- TrustLink Pay users receiving stablecoins,
- wallets that want privacy-preserving receive identities,
- merchants that do not want to expose treasury wallets,
- apps that want account-number-style payment UX on Solana.

Phone numbers and other social identities can be linked later as discovery signals, but the protocol identity is the TIN.

### 2. TSN Settlement

TSN is the private settlement layer.

The sender signs a sponsored settlement authorization. A verified cranker checks the mempool work, sponsors the escrow transaction, and moves funds into a TSN vault path. Recipient payout is executed through cranker vault settlement instead of direct wallet-to-wallet transfer.

TSN separates:

1. sender authorization,
2. cranker verification,
3. escrow funding,
4. recipient payout,
5. off-chain proof and protocol accounting.

### 3. TrustLink Pay App

The TrustLink Pay app is the first product surface built on TINS and TSN.

It provides:

- TIN creation and profile display,
- approved stablecoin send flow,
- sender authorization signing,
- transaction status tracking,
- recipient notifications,
- payment history and claim surfaces.

WhatsApp remains useful for notifications, consent, onboarding, and optional social linking. It is not the core payment identity in the protocol narrative.

---

## Payment Flow

### Send

1. Sender enters a recipient TIN.
2. TrustLink Pay resolves the TIN to the recipient settlement route.
3. Sender reviews amount, sender fee, and settlement details.
4. Sender signs the TSN authorization and co-signed sponsored settlement transaction.
5. The authorization enters the TSN mempool.
6. A verified cranker validates the work and sponsors escrow.
7. Funds move into the TSN escrow/vault path.

### Settlement

1. TSN records the payment as escrowed.
2. Recipient-side claim work becomes available.
3. A cranker with claim credit executes payout from vault liquidity.
4. Proof is recorded through transaction hashes and mempool state.
5. User-facing state moves from pending to escrowed to executed.

### Privacy Outcome

- The sender does not need to know the recipient wallet.
- The recipient does not need to know the sender wallet.
- The public chain does not present a simple direct wallet-to-wallet transfer path.
- The protocol can still verify settlement through transaction signatures, vault state, cranker records, and deterministic program rules.

---

## TINS: 10-Digit Payment Identity

TINS is the identity layer of the ecosystem.

Each user owns a 10-digit Transfer Identity Number, similar in feel to an account number, but built for Solana applications.

TINS is designed for:

- payment identity,
- wallet abstraction,
- safer receiving,
- multi-wallet routing,
- future social identity linking,
- developer-accessible resolution.

The long-term vision is that any wallet or app can let a user receive by TIN instead of exposing a raw wallet address.

---

## TSN: Private Settlement Network

TSN is the settlement infrastructure behind TrustLink Pay.

It exists because identity alone is not enough. If a sender resolves a TIN and transfers directly to the recipient wallet, the privacy benefit collapses. TSN adds the settlement layer that separates the sender-side funding path from the recipient-side payout path.

TSN uses:

- signed payment authorizations,
- cranker verification,
- sponsored escrow transactions,
- verifier PDA infrastructure funding,
- cranker vault liquidity,
- off-chain proof records,
- epoch-aware accounting.

---

## Crankers

Crankers are verified settlement operators.

They:

- monitor TSN mempool work,
- validate sender authorization and transaction structure,
- reject tampered or invalid payment work,
- sponsor escrow submission,
- earn claim credit for useful intent work,
- execute eligible claim work,
- submit proof through transaction records and mempool state.

A cranker cannot simply jump to claim work. Claim credit is earned by performing valid payment-intent escrow work first. This keeps the network balanced around useful settlement execution.

---

## Fees And Liquidity

TSN separates sender fees, claim fees, operator work, and vault liquidity.

The current settlement-fee model prioritizes liquidity providers while keeping operator and treasury incentives alive:

| Recipient             | Share | Purpose                                                |
| --------------------- | ----: | ------------------------------------------------------ |
| Liquidity providers   |   87% | Rewards vault capital that makes fast payout possible  |
| TSN protocol treasury |    8% | Supports audits, development, operations, and reserves |
| Cranker/operator      |    5% | Covers uptime, verification, execution, and proof work |

Sender-side fees can route to treasury infrastructure. Claim-side fee value can remain inside the cranker vault accounting path so liquidity and settlement capacity stay useful.

---

## Security Model

| Guarantee               | How it works                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| TIN-first identity      | Users pay a 10-digit identity, not a raw address                  |
| Sender authorization    | Sender signs approval before settlement work enters TSN           |
| Sponsored settlement    | Cranker/operator pays network execution cost                      |
| Vault isolation         | Funds move into protocol-controlled vault/token accounts          |
| Cranker verification    | Invalid or tampered work is rejected before chain submission      |
| Reduced wallet exposure | Sender and recipient paths are separated by TSN                   |
| Claim credit discipline | Crankers earn claim eligibility by submitting valid escrow work   |
| Off-chain proof trail   | Settlement proof is tracked through tx hashes and mempool records |

---

## Current Status

TrustLink Pay has working TINS identity, TSN mempool, cranker-sponsored escrow, private vault payout, claim execution, and transaction-state tracking on devnet.

Current program IDs:

| Program | Devnet ID                                     |
| ------- | --------------------------------------------- |
| TINS    | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |
| TSN     | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |

---

## Future Direction

TrustLink Pay starts with TIN-first payments and TSN settlement.

Future protocol surfaces may include:

- phone, WhatsApp, X, business, and social identity links to TINs,
- wallet-native TIN receive flows,
- payment PDAs that can receive funds and auto-route through TSN,
- third-party wallet integrations,
- broader SPL asset support,
- mature multi-operator cranker markets.

The priority is proving the privacy-preserving TIN-to-TSN settlement system first. Social identity linking comes after the protocol rail is strong.

---

## Repository Structure

| Path                    | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `frontend`              | TrustLink Pay dApp and transaction UX                    |
| `backend`               | API, user state, notification, and payment orchestration |
| `tins-registrar`        | TINS on-chain identity program                           |
| `tins-sdk`              | TINS SDK package surface                                 |
| `tsn/protocol`          | Anchor settlement programs                               |
| `tsn-sdk`               | TSN protocol SDK                                         |
| `tsn-cranker-op-daemon` | Reference cranker operator daemon                        |
| `tsn-mempool-backend`   | TSN mempool service                                      |
| `tsn-mempool-frontend`  | TSN mempool explorer                                     |
| `docs`                  | Protocol and operator documentation                      |

---

## Documentation

| Document               | Description                |
| ---------------------- | -------------------------- |
| `docs/ARCHITECTURE.md` | System architecture        |
| `docs/TINS.md`         | TINS identity protocol     |
| `docs/PROTOCOL.md`     | TSN settlement protocol    |
| `docs/SECURITY.md`     | Security and privacy model |
| `docs/INTEGRATION.md`  | SDK integration guide      |
| `docs/CRANKER.md`      | Cranker operator guide     |

---

## Quick Start

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

For full TSN stack testing, use the root scripts in `package.json`.

---

## Milestones

### StableHacks 2026

[StableHacks 2026](https://dorahacks.io/hackathon/stablehacks/detail) - Track: Programmable Stablecoin Payments

Proved the first end-to-end identity payment path: verified recipient identity, escrow-backed payments, gasless UX design, and hardened escrow architecture.

### The Bags Hackathon

[The Bags Hackathon](https://dorahacks.io/hackathon/the-bags-hackathon/detail) - Track: Payments

Extended the TrustLink payment model toward approved SPL asset transfers through identity-first routing.

### TINS Protocol

Working devnet identity registry for 10-digit Transfer Identity Numbers. TINS is the core payment identity layer for TrustLink Pay and future wallet integrations.

[TINS Overview](tins-registrar/README.md)

### TSN Settlement Network

Working cranker-sponsored escrow, private vault payout, proof records, mempool-first settlement work, and epoch-aware accounting architecture.

---

## Funding & Support

TrustLink Pay received support through the Superteam Agentic Engineering Grant program - approved for **200 USDG** to accelerate fraud protection system development.

Grateful to [@SuperteamEarn](https://twitter.com/SuperteamEarn) and the [@SuperteamNG](https://twitter.com/SuperteamNG) community. Special thanks to [@NzubeEzudo](https://twitter.com/NzubeEzudo) and [@Harri_Obi](https://twitter.com/Harri_Obi).

---

**TrustLink Pay** - private Solana payments to 10-digit identities, settled through TSN.
