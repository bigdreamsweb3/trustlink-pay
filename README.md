# TrustLink Pay

> Secure, privacy-first, identity-first, and confidential Solana payments using 10-digit Transfer Identity Numbers (TINs).

TrustLink Pay replaces raw wallet addresses with simple, portable payment identities while linking social identities to build confidence in recipients. All payments are gasless—users don’t need SOL in their wallet to send or receive tokens.

## Overview

TrustLink Pay is an identity-first payment network built on Solana.

Instead of sending funds to wallet addresses, users send funds to a 10-digit Transfer Identity Number (TIN).

TrustLink Pay separates payment identity, identity verification, and settlement into independent protocol layers:

- **TINS (Transfer Identity Number System)** — the payment identity layer.
- **SAS (Solana Attestation Service)** — the trust and verification layer.
- **TSN (Transfer Settlement Network)** — the privacy-preserving settlement layer.

An optional WhatsApp communication layer enables phone-based discovery, notifications, account recovery workflows, and confidence verification.

This architecture allows users to:

- Pay using a TIN.
- Verify recipient identity before sending.
- Avoid exposing wallet addresses during normal payment flows.
- Send and receive tokens without requiring SOL for gas.

> [!TIP]
> TrustLink Pay combines payment identity, verified identity, and privacy-preserving settlement into a single user experience.
---

## Why TrustLink Pay Matters

### Users

- Send using a TIN instead of wallet addresses.
- View verified recipient identity before sending.
- Maintain stronger wallet privacy.
- Enjoy gasless payment experiences.

### Merchants

- Accept payments without exposing treasury wallets.
- Display verified business identities through SAS.
- Build trust with customers through verified payment profiles.

### Developers

- Integrate payment identities through TINS.
- Verify identities through SAS.
- Access privacy-preserving settlement through TSN.
- Build payment experiences without rebuilding infrastructure.

> [!TIP]
> TrustLink Pay feels familiar like bank-account transfers while preserving the openness of blockchain settlement.

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

> [!TIP]
> TrustLink Pay is not trying to hide that Solana transactions exist. It is designed so the normal payment journey does not expose a clean sender-wallet-to-recipient-wallet graph. To follow settlement, an observer needs specific transaction context, vault context, or program-level knowledge.

---

## Core Architecture

TrustLink Pay consists of four complementary layers.

### 1. TINS — Payment Identity Layer

Every user receives a 10-digit Transfer Identity Number (TIN).

The TIN becomes the public payment identifier.

Users share:

1234567890

instead of:

4Q7...gF9k

TINS stores:

- TIN ownership
- Privacy routing metadata
- Verification status
- Verification level
- Encrypted verified-name references
- WhatsApp communication mappings

Wallet addresses remain abstracted behind the protocol.

---

### 2. WhatsApp Communication Layer

WhatsApp acts as the communication and confidence layer.

Used for:

- Notifications
- Payment alerts
- Account communication
- Phone-number payment routing
- Additional identity confidence

Phone numbers are encrypted and never publicly exposed.

---

### 3. SAS — Trust & Verification Layer

TrustLink integrates Solana Attestation Service (SAS).

SAS provides reusable verification credentials issued by trusted issuers.

Examples:

- Government verification
- KYC verification
- Merchant verification
- Business verification
- Proof-of-personhood

When a TIN is resolved:

1234567890

TrustLink can display:

✓ John A. Doe
Government Verified

without exposing sensitive identity documents.

---

### 4. TSN — Transfer Settlement Network

TSN is the privacy-preserving settlement layer.

TSN separates:

- Sender authorization
- Escrow funding
- Cranker execution
- Recipient payout

This prevents a simple sender-wallet-to-recipient-wallet payment graph from appearing during normal payment flows.

TSN also powers:

- Gasless payments
- Settlement proofs
- Vault liquidity
- Cranker settlement markets
- Smart Epoch-based reimbursement

---

## Payment Flow

### Identity Resolution

1. User enters recipient TIN.
2. TINS resolves identity.
3. SAS verification status is checked.
4. Verified name is displayed.
5. User reviews trust level before sending.

Example:

TIN:
1234567890

Recipient:
John A. Doe

Verification:
✓ Government Verified

Trust Score:
High

---

### Payment Authorization

1. Sender approves payment.
2. TSN creates settlement intent.
3. Intent enters TSN mempool.
4. Crankers validate intent.

---

### Settlement

1. Cranker claims settlement work.
2. Vault liquidity performs payout.
3. Settlement proof is generated.
4. Commitment token is registered.
5. Recovery rights are assigned.
6. Payment becomes recoverable through reimbursement accounting.

---

### Privacy Outcome

- Sender does not know recipient wallet.
- Recipient does not know sender wallet.
- Wallet relationships remain abstracted behind TSN.
- Settlement remains verifiable through proofs and protocol rules.

---

## Security & Confidence

| Guarantee | How it works |
|------------|------------|
| TIN-first identity | Payments use 10-digit TINs instead of wallet addresses |
| Verified identity | SAS attestations validate identity |
| WhatsApp confidence | Encrypted phone verification improves trust |
| Verified names | Resolved names come from verified attestations |
| Gasless UX | Users do not require SOL |
| Sender authorization | Sender signs payment intent |
| Vault isolation | Settlement liquidity separated from user wallets |
| Cranker verification | Settlement only occurs after validation |
| Settlement proofs | Every payout generates verifiable proof |
| Recovery protection | Commitment-token registry prevents duplicate claims |

---

## Powered by Solana

TrustLink Pay introduces four specialized layers on top of Solana:

| Layer | Purpose |
|---------|---------|
| TINS | Payment Identity Layer |
| WhatsApp | Communication & Confidence Layer |
| SAS | Trust & Verification Layer |
| TSN | Privacy Settlement Layer |

Together they create:

Identity + Trust + Privacy + Settlement

for real-world payments.

> [!TIP]
> Together, these components enable users to pay by phone number or 10-digit TIN without exposing wallet addresses or direct wallet-to-wallet payment paths.

## TINS — Transfer Identity Number System

TINS is the identity layer of the TrustLink ecosystem.

Every user receives a 10-digit Transfer Identity Number (TIN) that functions as a portable payment identity across Solana applications.

TINS enables:

- Human-friendly payment identities
- Wallet abstraction
- Safer receiving experiences
- Multi-wallet routing
- Future social identity integration
- Developer-accessible identity resolution

> [!TIP]
> The long-term vision is simple: users should be able to receive payments through a TIN instead of sharing raw wallet addresses.

## TSN — Transfer Settlement Network

TSN is the privacy-preserving settlement layer powering TrustLink Pay.

Identity alone does not provide privacy. If payments are sent directly from one wallet to another after TIN resolution, transaction relationships remain visible.

TSN separates the sender funding path from the recipient payout path through a settlement architecture built on Solana.

TSN utilizes:

- Signed payment authorizations
- Cranker verification
- Sponsored escrow transactions
- Verifier PDA infrastructure
- Settlement vault liquidity
- Off-chain proof records
- Epoch-aware accounting

This architecture allows TrustLink Pay to preserve payment privacy while maintaining verifiable settlement.

## Crankers — Settlement Operators

Crankers are verified network operators responsible for executing settlement work across TSN.

They:

- Monitor pending settlement work
- Validate payment authorizations
- Reject invalid or tampered instructions
- Sponsor escrow submissions
- Execute eligible settlement claims
- Submit settlement proofs
- Maintain network liveness

Crankers earn claim rights through useful settlement participation rather than passive ownership, creating incentives that align with network security and reliability.

---

## Fees & Liquidity

| Recipient             | Share | Purpose                            |
| --------------------- | ----: | ---------------------------------- |
| Liquidity providers   |   87% | Ensure fast payout and liquidity   |
| TSN protocol treasury |    8% | Audit, development, and operations |
| Cranker/operator      |    5% | Verification and settlement work   |

---

## Stakeholder Benefits

### Users

- Pay using TINs
- Verify recipients before sending
- Enjoy gasless transactions
- Maintain stronger wallet privacy

### Merchants

- Display verified business identities
- Receive payments without exposing treasury wallets
- Build customer trust

### Developers

- Integrate TINS resolution
- Integrate SAS verification
- Integrate TSN settlement
- Build payment applications faster
---

## Current Status

### TINS

- Devnet registry live
- 10-digit identity resolution active
- WhatsApp verification active
- Privacy routing active

### TSN

- Mempool operational
- Cranker settlement operational
- Escrow settlement operational
- Vault payout architecture operational
- Epoch reimbursement architecture designed

### SAS Integration

- Architecture finalized
- Registry integration planned
- Verified-name resolution planned
- Attestation verification planned

**Devnet Program IDs**

| Program | Devnet ID                                     |
| ------- | --------------------------------------------- |
| TINS    | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |
| TSN     | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |

---

## Future Direction

- SAS verified-name resolution
- Government and KYC attestation support
- Merchant verification badges
- Trust-score engine
- Wallet-native TIN payments
- Expanded SPL asset support
- Multi-operator cranker markets
- Mobile-first payment experiences
- TIN SDK ecosystem expansion
- Cross-application identity portability

---

## Repository Structure

| Path                    | Purpose                                         |
| ----------------------- | ----------------------------------------------- |
| `frontend`              | dApp and transaction UX                         |
| `backend`               | API, state, notification, payment orchestration |
| `tins-registrar`        | On-chain TIN identity program                   |
| `tins-sdk`              | TIN SDK package                                 |
| `tsn/protocol`          | Anchor settlement programs                      |
| `tsn-sdk`               | TSN protocol SDK                                |
| `tsn-cranker-op-daemon` | Reference cranker operator daemon               |
| `tsn-mempool-backend`   | TSN mempool service                             |
| `tsn-mempool-frontend`  | TSN mempool explorer                            |
| `docs`                  | Protocol and operator documentation             |

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

> [!TIP]
> **TrustLink Pay** — Privacy-preserving Solana payments with confidence-first TIN identities, powered by TSN settlement on [Solana](https://solana.com/).