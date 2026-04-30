# TrustLink Pay

> Send stablecoins on Solana to a WhatsApp phone number with the same confidence as a bank alert.

TrustLink Pay is a phone-number-first payment solution built for real-world stablecoin transfers. Instead of forcing users to copy wallet addresses, TrustLink lets a sender choose a supported asset, enter a WhatsApp number, move funds into escrow, and let the recipient complete a guided claim flow.

![Home dashboard](public/screenshots/01-home-dashboard.png)

_TrustLink Pay turns a WhatsApp number into a safer payment destination without making users think like blockchain operators first._

## Pitch Links

- [Pitch video - 60 seconds edition](https://youtube.com/shorts/9IH888rWwDo?si=Pe3-PPU3oUjhVezq)
- [Pitch Deck Slides](https://pitch.com/v/trustlink-pay-pitch-7d8h4e)

## What TrustLink Pay Actually Is

TrustLink Pay is **not** a WhatsApp chat app. It is not a messaging product. It is not a custodial wallet.

TrustLink Pay is a **noncustodial stablecoin payment dApp** that uses WhatsApp phone numbers as human-readable payment identities - the same way Pix uses CPF numbers in Brazil, UPI uses phone numbers in India, or OPay uses phone numbers in Nigeria. The difference is that TrustLink settles on Solana, in stablecoins, with cryptographic guarantees that no bank or payment processor can match.

The WhatsApp layer serves several important roles:

1. **Identity proxy** - a WhatsApp phone number is the human-readable identity that lets TrustLink route payments without exposing raw wallet addresses to the sender.
2. **Business identity confidence** - when a sender pays a WhatsApp Business account, TrustLink can surface the business identity so the sender has stronger confidence that the payment is going to the right merchant, not a spoofed wallet.
3. **Notification layer** - TrustLink uses WhatsApp to notify users that a payment was sent, received, pending, or ready to claim.
4. **Authentication layer** - TrustLink uses WhatsApp OTP and number verification to confirm that a user really controls the number they are using to create or access a TrustLink account.
5. **Account security layer** - WhatsApp verification helps secure onboarding, account access, and other identity-sensitive TrustLink flows.

That still does **not** mean TrustLink Pay is a native WhatsApp app today. TrustLink Pay currently uses WhatsApp as the identity, trust, authentication, and notification layer around a noncustodial on-chain payment system.

In the future, TrustLink may support a more native bot-style WhatsApp payment experience, where users can trigger payments through a conversational flow. That is a future direction, not the current product.

---

## The Problem TrustLink Solves

### Wallet addresses are a UX catastrophe

A Solana wallet address looks like this: `4yfu48GhqFBMDrHJr9VBnGMDHJr9VBnGMDHJr9gnhY`

It is 44 characters of random-looking text. It cannot be memorised. It cannot be verified by eye. One wrong character and the money is gone forever - blockchain transactions are irreversible.

### Address poisoning is a real, documented threat

On 23 November 2024, a Solana user lost **$2.91 million** by copying a fake wallet address that looked almost identical to the intended one. The attacker had seeded the victim's transaction history with a lookalike address, knowing the victim would copy from history instead of typing from scratch.

![Illustration of an address-poisoning style payment scam](public/nov-23-24-crypto-loss-to-scam.png)

_Illustration: a user confused after losing funds by sending crypto to the wrong wallet address or falling victim to a scam._

- Intended: `4yfu48...gnhY`
- Fake: `4yfuQC...izcY`

[Source: Solscan transaction](https://solscan.io/tx/T3vqZjMEi8MrJ34pwgnPG1ZjrFwygw6KYzij4Rt8dcFp2gZMqurHxC2Ta9gK7gELq2XXr4xpyotUYZryvQ2h5RP)

TrustLink eliminates this attack vector entirely. The sender never sees or types a wallet address. They type a phone number they already know.

### Crypto payments are not accessible to most people

In Nigeria, India, Brazil, and across emerging markets, hundreds of millions of people already use phone-number-based payment apps every day. They understand the mental model. They trust it. What they do not trust - and should not have to learn - is a 44-character wallet string.

TrustLink keeps the familiar UX and upgrades the settlement rails underneath to stablecoins on Solana.

## What TrustLink Pay Does (Our Solution)

TrustLink Pay lets a sender pay a person or business without pasting a long wallet address.

The sender sees a familiar identity:

- a phone number
- a TrustLink identity
- a verified WhatsApp Business identity when available

Under the hood, the payment is routed into a per-transaction escrow PDA. The recipient proves ownership with ephemeral privacy keys and derivation proofs. The platform does not hold the funds, does not hold recipient private keys, and cannot arbitrarily redirect the payment.

---

## How TrustLink Pay Works

### The Send Flow

![Send crypto flow](public/screenshots/02-send-flow.gif)

_The sender flow is built around identity confidence first, then escrow-backed payment creation._

1. The sender opens TrustLink, logs in with their WhatsApp number, and completes OTP verification.
2. They enter the recipient's WhatsApp phone number and the amount to send.
3. TrustLink verifies the recipient's identity state before any money moves.
4. The sender confirms. Their wallet signs the transaction. Funds move into a **per-payment escrow vault** on Solana - not to TrustLink, not to a pool, to a unique on-chain account that only the recipient can unlock.
5. TrustLink sends the recipient a WhatsApp notification if they are registered and opted in, or generates a personal invite link the sender can share manually.
6. TrustLink sponsors the Solana network fee. The sender does not need SOL.

### The Claim Flow

![Claim flow](public/screenshots/05-claim-flow.gif)

_TrustLink guides the recipient from message to claim without exposing raw blockchain complexity._

1. The recipient receives a TrustLink notification or invite link.
2. They open TrustLink, verify their WhatsApp number with OTP, and set up a PIN.
3. They connect a Solana wallet and claim the payment.
4. The escrow releases funds directly to their wallet. TrustLink deducts a small claim fee and sponsors the Solana gas.
5. The escrow account closes. Rent returns to TrustLink. The payment is final.

## Why This Matters

Crypto payments are still hard for normal users because wallet addresses are:

- long
- easy to mistype
- easy to poison with lookalike addresses
- hard to trust for business payments

TrustLink Pay replaces "paste this raw wallet string" with:

- "pay this phone-linked recipient"
- "pay this verified business identity"
- "let the escrow program enforce the actual payout rules"

This is the bridge between everyday messaging identity and safe stablecoin settlement.

## Core Security Claim

TrustLink Pay is designed so that no TrustLink operator wallet can sweep user escrow funds just because the payment exists.

The TrustLink v3 architecture is built around:

- per-payment escrow PDAs
- per-payment escrow vaults
- ephemeral recipient child keys
- derivation proofs signed by the recipient master registry key
- on-chain nonce consumption
- strict Ed25519 verification before release

That means a payment can only move if the program sees valid cryptographic proof that matches the escrow's stored rules.

## Why Funds Are Safe

### 1. Every payment is isolated

Each payment gets its own escrow PDA and token vault.

One escrow does not share authority with another. A bug or dispute on one payment does not automatically expose the rest of the system.

### 2. The recipient is not identified by a leaked phone hash on-chain

TrustLink Pay does not use "hash phone number and store that as the on-chain identity" as the core payment identity.

The hardened flow uses:

- a recipient master registry public key
- a child public key derived for a specific payment context
- a hash of that child public key stored in the escrow

This is safer and more private because observers do not get a reusable phone-derived on-chain label to monitor.

### 3. Claims require cryptographic proof, not backend trust

For a manual claim, the program verifies:

- the child public key matches the hash stored in escrow
- the master registry key signed a derivation proof binding that child key to this escrow, nonce, expiry, and destination
- the child key signed the claim payload for this escrow, nonce, expiry, and destination

If any part fails, the funds do not move.

### 4. Replay attacks are blocked on-chain

Each escrow has a nonce.

When a claim or auto-claim succeeds, the program creates a nonce-consumption PDA tied to:

- the recipient master registry public key
- the nonce

That closes the replay path. A previously valid signature cannot be reused against the same nonce because the nonce PDA already exists.

### 5. Front-running cannot reroute the destination

The derivation proof and claim payload both bind the destination.

That means an attacker cannot take a valid proof and swap in a different wallet destination. The signature check will fail, or the destination hash stored in escrow will reject the route.

### 6. Expiry does not make TrustLink custodial

The TrustLink v3 direction is noncustodial:

- funds remain in program-controlled escrow until a valid release condition is met
- auto-claim can route to the user's pre-approved destination
- the platform still does not gain arbitrary withdrawal power

The security model is "prove and release," not "trust the operator to manually recover."

## Approved Hardened Architecture

### Off-chain registry

Each recipient maintains a registry profile off-chain containing:

- `master_privacy_pubkey`
- `auto_claim_destination`
- registry metadata

The private master key is not stored by the TrustLink backend.

### Child key model

For each payment context, the recipient derives an ephemeral child key.

That child key is then bound to the escrow through a signed derivation proof.

This gives TrustLink Pay:

- key isolation per payment
- reduced blast radius if a child key leaks
- strong privacy because repeated payments do not share the same visible public key

### Escrow state

The hardened escrow stores:

- sender
- master registry public key
- recipient child key hash
- amount
- mint
- nonce
- expiry
- auto-claim destination hash
- derivation proof signature
- state

### Manual claim

Before expiry, the recipient can claim by presenting:

- `child_pubkey`
- `child_sig`
- `derivation_proof_sig`
- destination

The program verifies both signatures and consumes the nonce before releasing funds.

### Auto-claim

After expiry or the configured trigger condition, a crank can submit an auto-claim to the recipient's approved destination.

The crank is not trusted with custody.

It only supplies a transaction. The escrow program still decides whether release is valid.

## Threat Model

### Threat: forged child key relationship

Attack:
An attacker fabricates a child key and tries to pretend it belongs to the recipient.

Defense:
The program requires a derivation proof signed by the recipient master registry public key and checks that the child public key hash matches the escrow.

### Threat: replayed claim signature

Attack:
An attacker reuses a previously valid signature to drain the escrow or claim twice.

Defense:
The program consumes a nonce on-chain per master registry key. Reuse fails.

### Threat: destination substitution

Attack:
A front-runner intercepts a claim and swaps the destination wallet.

Defense:
Destination is bound into the signed messages and checked against the stored destination hash.

### Threat: operator custody risk

Attack:
Users fear TrustLink can "just move the funds later."

Defense:
The escrow program requires valid user-linked proofs. TrustLink does not need to hold recipient private keys and cannot author a valid claim by itself.

## TrustLink Edge

TrustLink Pay combines three things most crypto payment products do not combine well:

- everyday identity UX
- privacy-preserving routing
- noncustodial programmable settlement

That is the core edge:

- send to phone number
- confirm with business identity
- settle with cryptographic escrow

## WhatsApp Business Identity: Paying Businesses With Confidence

When a sender pays a WhatsApp Business account through TrustLink, the app surfaces the verified business identity. The sender sees:

- the business display name
- the business handle
- TrustLink verification cues

This solves a real problem in crypto payments: how do you know the wallet address `4yfu48...gnhY` belongs to the business you want to pay? With TrustLink, you do not need to know the wallet address. You pay the WhatsApp Business number you already have in your contacts, and TrustLink's identity layer confirms the payment is going to that verified business entity.

This is especially valuable for:

- **Merchant payments** — pay a business by their WhatsApp Business number, not a QR code that could be swapped
- **Payroll** — pay employees by their registered phone number
- **Remittances** — send money home to a family member's phone number
- **B2B payments** — pay a supplier whose WhatsApp Business identity you have already verified

---

## The Gasless Experience

TrustLink users do not need SOL to send or receive payments.

- The sender pays a small fee in the token they are sending (e.g. USDC). No SOL required.
- The recipient pays a small claim fee deducted from the payout. No SOL required.
- TrustLink's verifier wallet sponsors all Solana network fees.
- Recoverable account rent is reclaimed by TrustLink when escrow vaults close — it is not charged to users.

This makes TrustLink feel like a modern payment app, not a blockchain tool.

---

## Sender Delivery Visibility

For registered recipients, TrustLink gives the sender real-time delivery receipts:

- **Sent** — the WhatsApp notification was delivered to WhatsApp's servers
- **Delivered** — the notification reached the recipient's device
- **Seen** — the recipient opened the notification

This is the same delivery confidence a sender gets from a bank alert, applied to a crypto payment.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        TrustLink Pay                            │
├──────────────────┬──────────────────┬───────────────────────────┤
│   Frontend       │   Backend        │   Blockchain              │
│   Next.js 15     │   Node.js        │   Solana                  │
│   React 19       │   Next.js API    │   + Anchor                │
│   Tailwind v4    │   Postgres DB    │   SPL Token Program       │
│                  │   WhatsApp API   │   Ed25519 Program         │
│                  │   OTP / PIN      │   Per-payment PDAs        │
└──────────────────┴──────────────────┴───────────────────────────┘
```

### Identity Layer

- Phone number → SHA-256 hash → on-chain `IdentityBinding` PDA
- WhatsApp OTP confirms phone ownership
- In-app PIN adds a second access control layer
- Master privacy key → ephemeral child keys (v3 escrow)

### Escrow Layer (v2 — production)

- Per-payment `PaymentAccount` PDA
- Per-payment escrow vault token account
- Verifier-signed claim release
- Rotating recovery wallets for expired payments

### Escrow Layer (v3 — hardened)

- Per-payment `EscrowV3` PDA seeded by `child_hash + nonce + mint`
- Ephemeral Ed25519 child keys derived from master privacy key
- On-chain derivation proof verification via Ed25519 sysvar introspection
- Bitmask `NonceAccount` PDAs for O(1) replay prevention
- Destination hash binding at creation time
- Auto-claim path for expired escrows via crank

### Messaging Layer

- WhatsApp Business API for payment notifications
- Webhook-driven opt-in and opt-out
- Delivery receipt tracking (sent / delivered / seen)
- Manual invite generation for unregistered recipients

---

## Security Model Summary

| Property                     | Guarantee                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| Noncustodial                 | TrustLink never holds user funds or private keys                                        |
| Per-payment isolation        | Each payment has its own escrow vault                                                   |
| Replay prevention            | On-chain nonce bitmask; consumed nonces cannot be reused                                |
| Derivation proof             | Master key signature binds child key to specific escrow, nonce, expiry, and destination |
| Destination binding          | Auto-claim destination hashed at creation; cannot be changed after the fact             |
| Front-run resistance         | Destination mismatch check before any token transfer                                    |
| Double-claim prevention      | State set to `Claimed` atomically with transfer                                         |
| Address poisoning prevention | Sender never types or sees a wallet address                                             |
| Public auditability          | All escrow transactions on Solana's public ledger                                       |

---

---

## Why This Matters For Solana

TrustLink Pay lowers one of the biggest UX barriers to stablecoin adoption on Solana: address-based payments.

By replacing wallet addresses with a familiar phone-number identity layer, TrustLink makes stablecoin transfers more understandable and accessible for:

- **Cross-border payments** — international remittances without wallet addresses
- **Remittances** — sending money home to family using a phone number
- **Payroll** — paying employees or contractors by phone number identity
- **Merchant payments** — retail and business payments using WhatsApp Business identity
- **First-time crypto users** — onboarding without blockchain complexity

This is especially important in emerging markets (Nigeria, India, Brazil, Southeast Asia) where phone-number payments are already a trusted mental model and billions of people already use UPI, Pix, OPay, or similar systems daily.

---

## Current Product Status

TrustLink Pay currently includes:

- ✅ phone-first WhatsApp authentication with OTP verification
- ✅ webhook-driven opt-in and opt-out management
- ✅ in-app 6-digit PIN security gating
- ✅ recipient identity verification before payment send
- ✅ per-payment escrow-backed payment creation
- ✅ gasless send and claim UX (TrustLink sponsors Solana fees)
- ✅ sender receipt-state indicators (sent / delivered / seen)
- ✅ manual invite flow for unregistered recipients
- ✅ full transaction detail pages with privacy-aware trace data
- ✅ WhatsApp Business account identity verification
- ✅ hardened v3 escrow with derivation proof verification
- ✅ backend referral attribution foundation (preparation for future rewards)

---

## Repository Structure

- [backend/programs/trustlink-escrow](backend/programs/trustlink-escrow): Anchor escrow program (v2 production, v3 hardened)
- [backend/app/blockchain/trustlink-pay-v3.ts](backend/app/blockchain/trustlink-pay-v3.ts): backend transaction builders
- [backend/app/lib/privacy-keys.ts](backend/app/lib/privacy-keys.ts): privacy key derivation and proofs
- [docs/payment-escrow-architecture.md](docs/payment-escrow-architecture.md): escrow architecture reference
- [docs/escrow-design.md](docs/escrow-design.md): on-chain design details
- [docs/wallet-roles.md](docs/wallet-roles.md): payment participant roles
- [docs/devnet-testing.md](docs/devnet-testing.md): devnet testing and setup guide
- [frontend](frontend): Next.js 15 frontend
- [backend](backend): Next.js App Router backend

---

## Quick Start

### Backend Setup

```bash
cd backend
npm install
npm run db:init
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Local Testing

For developers running local tests:

```bash
cd backend
npm run test:auth-phone-flow
npm run test:recipient-lookup
npm run test:payment-flow
npm run test:whatsapp-number
```

---

## Devnet Testing

For testers, judges, and new contributors who need devnet SOL, allowlisted test tokens, and the complete TrustLink payment flow:

- [Devnet Testing Guide](docs/devnet-testing.md)
- [Wallet Roles Reference](docs/wallet-roles.md)

The devnet guide includes:

- How to fund your wallet with devnet SOL
- How to claim test USDC
- How to run a complete send-and-claim flow
- How to verify payments on Solscan
- Troubleshooting common issues

---

## Core Documentation

- [Wallet roles and payment flow](docs/wallet-roles.md)
- [Payment escrow v2 architecture](docs/payment-escrow-architecture.md)
- [Escrow v3 hardened design](docs/escrow-design.md)
- [Devnet testing guide](docs/devnet-testing.md)

---

## Short Explanation

TrustLink Pay turns each payment into its own escrow account that only the intended recipient can unlock. Instead of trusting a company wallet, the system trusts signed proofs, single-use nonces, and on-chain verification. That gives users a simple "send to phone" experience while keeping the actual stablecoins under noncustodial program control.

**Result:** Crypto payments that feel as familiar and trustworthy as a bank alert, built on Solana.
