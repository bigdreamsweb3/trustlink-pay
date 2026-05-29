# TrustLink Pay

> Identity-based stablecoin payments on Solana — designed to feel as familiar as mobile money, with escrow-backed settlement and programmable payment infrastructure.

---

# Overview

The world already understands identity-first payments.

Nigeria has OPay and bank transfers. India has UPI. Brazil has Pix. Users send money to people, not wallet addresses.

Crypto still largely depends on:

* copied wallet addresses,
* irreversible transfers,
* confusing onboarding,
* and poor payment trust models.

TrustLink Pay brings identity-first payments to Solana.

Users send approved stablecoins to:

* a phone number,
* or a Transfer Identity Number (TIN),

instead of manually handling wallet addresses.

Under the hood, TrustLink combines:

* identity routing,
* escrow-backed settlement,
* and programmable payment infrastructure

to create safer and more accessible blockchain payments.

---

# Core Principles

TrustLink is built around four principles:

| Principle                | Description                                                |
| ------------------------ | ---------------------------------------------------------- |
| Identity-first UX        | Users pay people, not addresses                            |
| Escrow-backed settlement | Transfers can move through programmable escrow flows       |
| Reduced wallet exposure  | Users do not need to exchange wallet addresses directly    |
| Open infrastructure      | Developers can build on the identity and settlement layers |

---

# The Problem

Blockchain payments remain difficult for normal users.

Current crypto payment systems still rely heavily on:

* raw wallet addresses,
* permanent irreversible transfers,
* manual verification,
* and high-friction onboarding.

This creates major problems:

* address poisoning,
* payment mistakes,
* poor merchant UX,
* weak trust coordination,
* and limited mainstream usability.

Most users already understand:

* phone-number payments,
* mobile money,
* and identity-based transfers.

TrustLink adapts that experience for stablecoin payments on Solana.

---

# What TrustLink Pay Does

TrustLink allows users to:

* send approved stablecoins using a phone number or TIN,
* route payments through escrow-backed settlement,
* reduce direct wallet exposure,
* and onboard recipients through familiar identity flows.

The goal is not to replace wallets.

The goal is to simplify trusted blockchain payments for:

* remittances,
* merchants,
* freelancers,
* and internet-native commerce.

---

# Architecture

TrustLink is structured into three primary layers.

## 1. Application Layer (TrustLink App)

The application layer handles:

* onboarding,
* authentication,
* payment creation,
* transaction history,
* and user experience.

This layer abstracts blockchain complexity from normal users.

### Responsibilities

* phone-number onboarding
* wallet connection
* payment flow UI
* recipient notifications
* transaction visibility
* escrow lifecycle UX

---

## 2. Identity Layer (TINS)

TINS (Transfer Identity Number System) is the identity layer powering TrustLink.

TINS allows wallets to bind to a portable numeric identity.

Instead of sharing wallet addresses directly, users can receive payments through:

* phone numbers,
* or permanent TIN identities.

### Goals

* portable payment identity
* reduced address exposure
* developer-accessible identity resolution
* long-term interoperability

### Current Status

Current TINS functionality includes:

* wallet-bound TIN generation
* PDA-based identity accounts
* encrypted client-side identity submission
* backend-assisted identity verification

### Current Devnet Programs

| Program | Program ID                                    |
| ------- | --------------------------------------------- |
| TINS    | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |
| TSN     | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |

---

## 3. Settlement Layer (TSN)

TSN (Transfer Settlement Network) is the settlement infrastructure layer.

TSN coordinates:

* escrow-backed transfers,
* payout execution,
* settlement verification,
* and operator coordination.

The settlement architecture is designed to reduce direct sender-recipient wallet exposure while preserving verifiable protocol state.

### TSN Responsibilities

* escrow lifecycle management
* payment-intent coordination
* payout execution
* settlement verification
* operator reimbursement
* liquidity coordination

---

# Payment Flow

## Standard Send Flow

1. Sender enters a phone number or TIN.
2. TrustLink resolves the payment identity.
3. Sender reviews amount and fees.
4. Sender signs the transaction.
5. Funds enter escrow-backed settlement.
6. Settlement execution is coordinated through TSN.
7. Recipient receives payout through the linked wallet.

For onboarded recipients, settlement can complete automatically without requiring manual claim actions.

---

# Escrow & Settlement Model

TrustLink uses escrow-backed settlement instead of direct wallet-to-wallet transfers.

This model enables:

* safer payment coordination,
* programmable settlement logic,
* recovery flows for incomplete onboarding,
* and reduced wallet exposure between parties.

The escrow architecture is noncustodial at the protocol level and governed by Solana program rules.

---

# Operator Infrastructure

TSN uses specialized operators to coordinate settlement execution.

These operators:

* monitor settlement intents,
* execute payout flows,
* submit settlement proof,
* and maintain network reliability.

At launch, TrustLink will initially operate the settlement infrastructure directly to ensure:

* reliability,
* security,
* and operational consistency.

Future operator participation may expand gradually over time.

---

# Liquidity Infrastructure

Settlement liquidity allows payouts to complete efficiently during active settlement periods.

Liquidity providers may supply approved stablecoins to settlement vaults used during payout coordination.

The protocol is designed around real settlement activity rather than token-emission incentives.

---

# Security Model

TrustLink focuses heavily on payment safety and operational integrity.

## Security Goals

| Goal                     | Description                                                 |
| ------------------------ | ----------------------------------------------------------- |
| Escrow isolation         | Each payment maintains isolated settlement state            |
| Reduced address exposure | Users do not need to exchange wallet addresses directly     |
| Replay resistance        | Settlement execution includes replay protections            |
| Operator accountability  | Settlement operators maintain verifiable execution records  |
| Proof-based settlement   | Settlement completion depends on verifiable execution state |

---

# Privacy Model

TrustLink is designed to reduce unnecessary wallet exposure during payments.

## Important Clarification

TrustLink is not an anonymous payment system.

Blockchain settlement activity may still remain publicly observable depending on the underlying network and transaction structure.

The primary privacy goal is:

* reducing direct sender-recipient wallet exposure,
* and abstracting wallet coordination behind identity-based payment flows.

---

# Fraud Protection

TrustLink includes infrastructure protections intended to reduce malicious settlement activity.

Current protection mechanisms include:

* replay prevention,
* settlement verification,
* operator monitoring,
* behavioral heuristics,
* and anomaly detection systems.

Additional protections will continue evolving as network activity scales.

---

# Who TrustLink Is For

## Users

People sending:

* remittances,
* freelance payments,
* merchant payments,
* or internet-native stablecoin transfers.

## Merchants

Businesses accepting stablecoin payments without exposing wallet addresses publicly.

## Developers

Developers building:

* payment applications,
* merchant tools,
* identity-based settlement flows,
* and escrow-enabled commerce infrastructure.

## Infrastructure Operators

Future settlement operators and infrastructure participants supporting protocol execution and reliability.

---

# Current Status

## Live Functionality

* wallet onboarding
* phone-number routing
* WhatsApp-based identity flows
* escrow-backed payment creation
* stablecoin transfer support
* transaction review flows
* payment notifications
* TSN payment-intent scaffolding

## Active Development

* TINS registry expansion
* operator infrastructure
* settlement automation
* liquidity coordination
* expanded asset support
* protocol archival systems

---

# Roadmap

## Phase 1 — Identity-Based Payments

* phone-number payments
* escrow-backed transfers
* stablecoin settlement
* onboarding simplification

## Phase 2 — Settlement Infrastructure

* operator coordination
* automated settlement flows
* liquidity infrastructure
* settlement optimization

## Phase 3 — Open Infrastructure

* developer integrations
* public settlement tooling
* broader identity portability
* external ecosystem adoption

---

# Repository Structure

| Path             | Purpose                                    |
| ---------------- | ------------------------------------------ |
| `frontend`       | Next.js frontend application               |
| `backend`        | API and orchestration services             |
| `tsn/protocol`   | Anchor settlement programs                 |
| `tsn`            | TSN tooling and infrastructure             |
| `tins-registrar` | TINS identity protocol                     |
| `docs`           | Architecture and operational documentation |

---

# Quick Start

```bash
cd backend && npm install && tsx scripts/init-db.ts && npm run dev

cd frontend && npm install && npm run dev
```

---

# Documentation

| Document               | Description                 |
| ---------------------- | --------------------------- |
| `docs/ARCHITECTURE.md` | System architecture         |
| `docs/TINS.md`         | Identity layer              |
| `docs/PROTOCOL.md`     | Settlement protocol         |
| `docs/API.md`          | API reference               |
| `docs/DEVELOPER.md`    | Developer integration guide |

---

# Milestones

## StableHacks 2026

[StableHacks 2026](https://dorahacks.io/hackathon/stablehacks/detail) — Track: Programmable Stablecoin Payments

Proved the end-to-end product path: phone-verified identity, escrow-backed payments, gasless UX design, and hardened escrow architecture.

## The Bags Hackathon

[The Bags Hackathon](https://dorahacks.io/hackathon/the-bags-hackathon/detail) — Track: Payments

Extended the TrustLink payment model toward approved SPL asset transfers through identity-first routing.

## TINS Protocol

Active development. Moves identity routing from TrustLink's backend to a permanent on-chain registry.

[TINS Overview](tins-registrar/README.md)

## TSN Settlement Network

Cranker execution, Proof of Payment, mempool-first intents, and epoch reimbursement architecture.

---

# Funding & Support

TrustLink Pay received support through the Superteam Agentic Engineering Grant program — approved for **200 USDG** to accelerate fraud protection system development.

Grateful to [@SuperteamEarn](https://twitter.com/SuperteamEarn) and the [@SuperteamNG](https://twitter.com/SuperteamNG) community. Special thanks to [@NzubeEzudo](https://twitter.com/NzubeEzudo) and [@Harri_Obi](https://twitter.com/Harri_Obi).

---

# Vision

TrustLink aims to make blockchain payments feel closer to the systems users already trust:

* identity-first,
* simple,
* programmable,
* and globally accessible.

The long-term goal is to provide infrastructure for safer internet-native stablecoin commerce.
