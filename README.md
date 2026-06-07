# TrustLink Pay

> Secure, privacy-first, identity-first, and confidential Solana payments using 10-digit Transfer Identity Numbers (TINs).

TrustLink Pay replaces raw wallet addresses with simple, portable payment identities while linking social identities to build confidence in recipients. All payments are gasless—users don’t need SOL in their wallet to send or receive tokens.

## Overview

TrustLink Pay is an identity-first payment system on Solana.

Instead of asking users to paste wallet addresses, TrustLink Pay lets a sender pay a **10-digit Transfer Identity Number (TIN)**. The TIN is the public payment identity. The wallet address stays behind the protocol boundary.

The system is built around two protocol layers:

- **TINS - Transfer Identity Number System**: the on-chain identity registry for 10-digit wallet-owned payment numbers.
- **TSN - Transfer Settlement Network**: the settlement network that routes payment authorization, escrow, cranker verification, vault payout, and proof.

> [!TIP]
> The result is a payment flow that feels familiar like account-number payments, but settles through Solana infrastructure with stronger wallet privacy.

---

## Why TrustLink Pay Matters

- **Users:** Send and receive payments without exposing wallet addresses. Confidently verify recipients via linked social signals.
- **Merchants:** Accept payments securely without exposing treasury wallets, verified through confidence signals.
- **Developers:** Easy SDK integration using TINS and TSN; no need to rebuild settlement logic.

**Gasless Experience:** Users only need the stablecoin or token being sent; all transaction fees are paid via the protocol’s cranker mechanism, keeping wallets simple and friction-free.

TrustLink Pay combines **identity-first payment design** with **social identity confidence signals** and a **private settlement network** on Solana.

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

1. **TINS – Transfer Identity Number System**
   - Each user owns a 10-digit TIN, the public payment identity.
   - Social identities are linked for confidence in recipient verification.
   - Wallet addresses remain hidden behind the protocol.

2. **TSN – Transfer Settlement Network**
   - Private settlement layer separating sender authorization, cranker verification, escrow funding, and recipient payout.
   - Ensures wallet privacy while maintaining verifiable settlement.
   - Handles all fees internally—users do **not need SOL**, making payments gasless.

3. **TrustLink Pay App**
   - Create and manage TINs.
   - Send/receive approved stablecoins.
   - Track transaction status and notifications.
   - Confidence signals (WhatsApp linked) help users verify recipient identities.

---

## Payment Flow

**Send Payment**

1. Enter recipient TIN.
2. TSN resolves recipient settlement route.
3. Review amount, fees, and settlement details.
4. Sign TSN authorization.
5. Cranker validates and sponsors escrow, paying fees on-chain in the token being sent.
6. Funds move through TSN escrow/vault path.

**Settlement**

- Cranker executes payout from vault.
- Off-chain proof and mempool state track settlement.
- Privacy preserved: sender and recipient wallets are not directly exposed.
- Users **experience gasless transactions**, requiring only the token being sent.

### Privacy Outcome

- The sender does not need to know the recipient wallet.
- The recipient does not need to know the sender wallet.
- The public chain does not present a simple direct wallet-to-wallet transfer path.
- The protocol can still verify settlement through transaction signatures, vault state, cranker records, and deterministic program rules.

---

## Security & Confidence

| Guarantee                  | How it works                                                      |
| -------------------------- | ----------------------------------------------------------------- |
| TIN-first identity         | Payment via 10-digit TIN, not wallet address                      |
| Social identity confidence | Linked WhatsApp numbers verify recipient identity                 |
| Gasless transaction        | Fees covered by protocol in the token sent; users do not need SOL |
| Sender authorization       | Sender signs before settlement                                    |
| Vault isolation            | Funds held in protocol-controlled accounts                        |
| Cranker verification       | Only valid transactions are executed                              |
| Off-chain proof trail      | Settlement verifiable via transaction hashes and mempool records  |

---

# Powered by Solana

TrustLink Pay is built on Solana's high-performance infrastructure, combining identity, privacy, and settlement into a unified payment network.

At its core, Solana provides the security, speed, and decentralized execution layer. On top of that foundation, TrustLink Pay introduces three specialized layers:

- **TINS** — a portable payment identity layer.
- **TSN** — a privacy-preserving settlement layer.
- **Crankers** — a decentralized execution and verification layer.

Together, these components enable users to pay by phone number or 10-digit TIN without exposing wallet addresses or direct wallet-to-wallet payment paths.

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

The long-term vision is simple: users should be able to receive payments through a TIN instead of sharing raw wallet addresses.

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

- **Users:** Identity-first payments with social confidence signals.
- **Merchants:** Secure payment reception with confidence in recipient identity.
- **Developers:** TSN + TINS SDKs simplify integration.

---

## Current Status

- TIN identity registry live on devnet.
- TSN mempool, cranker-sponsored escrow, private vault payout, transaction-state tracking implemented.
- Social identity linking via WhatsApp phone numbers implemented for confidence.

**Devnet Program IDs**

| Program | Devnet ID                                     |
| ------- | --------------------------------------------- |
| TINS    | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |
| TSN     | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |

---

## Future Direction

- Expand social identity linking for **additional confidence signals**, including **X business accounts**.
- Wallet-native TIN receive flows.
- Payment PDAs that auto-route through TSN.
- Third-party wallet integrations.
- Broader SPL asset support.
- Mature multi-operator cranker markets.

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

**TrustLink Pay** — Privacy-preserving Solana payments with confidence-first TIN identities, powered by TSN settlement on [Solana](https://solana.com/).
