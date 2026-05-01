# TrustLink Pay

> Send stablecoins on Solana to a WhatsApp phone number with the same confidence as a bank alert.

TrustLink Pay is a phone-number-first, noncustodial stablecoin payment dApp on Solana. Instead of pasting wallet addresses, senders enter a WhatsApp number, funds move into a per-payment escrow, and the recipient completes a guided claim flow.

![Home dashboard](public/screenshots/01-home-dashboard.png)

## Pitch Links

- [Pitch video — 60 seconds](https://youtube.com/shorts/9IH888rWwDo?si=Pe3-PPU3oUjhVezq)
- [Pitch Deck Slides](https://pitch.com/v/trustlink-pay-pitch-7d8h4e)

---

## The Problem

### Wallet addresses are a UX catastrophe

A Solana address (`4yfu48GhqFBMDrHJr9VBnGMDHJr9VBnGMDHJr9gnhY`) is 44 random characters — impossible to memorise, trivial to mistype, and irreversible if wrong.

### Address poisoning is real

On 23 Nov 2024 a user lost **$2.91 M** by copying a lookalike address seeded into their transaction history. TrustLink eliminates this: the sender never sees a wallet address.

![Illustration of an address-poisoning style payment scam](public/nov-23-24-crypto-loss-to-scam.png)

_Illustration: a user confused after losing funds by sending crypto to the wrong wallet address or falling victim to a scam._

- Intended: `4yfu48...gnhY`
- Fake: `4yfuQC...izcY`

[Source: Solscan transaction](https://solscan.io/tx/T3vqZjMEi8MrJ34pwgnPG1ZjrFwygw6KYzij4Rt8dcFp2gZMqurHxC2Ta9gK7gELq2XXr4xpyotUYZryvQ2h5RP)

TrustLink eliminates this attack vector entirely. The sender never sees or types a wallet address. They type a phone number they already know.

### Crypto isn't accessible yet

Hundreds of millions of people in Nigeria, India, Brazil, and Southeast Asia already pay with phone numbers (UPI, Pix, OPay). TrustLink keeps that familiar UX and upgrades settlement to stablecoins on Solana.

---

## The Solution

TrustLink Pay replaces "paste a wallet string" with:

- **Pay a phone number** the sender already knows
- **Confirm a verified identity** (WhatsApp Business when available)
- **Settle through escrow** — per-payment PDAs the platform cannot sweep

### WhatsApp's role

| Layer               | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| Identity proxy      | Route payments by phone number, not raw addresses |
| Business confidence | Surface verified merchant identity to senders     |
| Notifications       | Payment sent / received / ready-to-claim alerts   |
| Authentication      | OTP + session-code verification                   |

WhatsApp is the identity and notification layer — TrustLink Pay is **not** a WhatsApp chat app or custodial wallet.

---

## How It Works

### Send Flow

![Send flow](public/screenshots/02-send-flow.gif)

1. Sender logs in → enters recipient WhatsApp number + amount
2. TrustLink verifies recipient identity before money moves
3. Sender confirms → wallet signs → funds enter a **unique escrow vault**
4. Recipient gets a WhatsApp notification (or sender shares an invite link)
5. TrustLink sponsors the Solana gas fee — no SOL needed

### Claim Flow

![Claim flow](public/screenshots/05-claim-flow.gif)

1. Recipient opens TrustLink → verifies WhatsApp OTP → sets PIN
2. Connects a Solana wallet → claims the payment
3. Escrow releases directly to their wallet; a small claim fee is deducted
4. Escrow account closes; rent returns to TrustLink

---

## Security Model

### Core guarantees

| Property                     | How                                                                 |
| ---------------------------- | ------------------------------------------------------------------- |
| Noncustodial                 | TrustLink never holds user funds or private keys                    |
| Per-payment isolation        | Each payment gets its own escrow vault PDA                          |
| Replay prevention            | On-chain nonce bitmask; consumed nonces can't reuse                 |
| Derivation proof             | Master key binds child key to escrow + nonce + expiry + destination |
| Front-run resistance         | Destination hash checked before any transfer                        |
| Address poisoning eliminated | Sender never sees a wallet address                                  |

### Key architecture (v3 hardened)

- **Ephemeral child keys** derived from a master privacy key per payment
- **Derivation proofs** verified on-chain via Ed25519 sysvar introspection
- **Nonce-consumption PDAs** for O(1) replay prevention
- **Destination-hash binding** at escrow creation — cannot change after the fact
- **Auto-claim path** via crank for expired escrows (crank has no custody)

### Threat model

| Threat             | Defense                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| Forged child key   | Program requires derivation proof signed by master key + child hash match |
| Replayed signature | On-chain nonce consumed; reuse fails                                      |
| Destination swap   | Destination bound in signed payload; mismatch rejected                    |
| Operator custody   | Escrow requires valid user proofs; platform cannot author claims          |

---

## Gasless Experience

No SOL required for senders or recipients:

- Sender pays a small fee in the token being sent (e.g. USDC)
- Recipient's claim fee is deducted from the payout
- TrustLink sponsors all Solana network fees
- Account rent is reclaimed when escrow vaults close

## Sender Delivery Visibility

Real-time WhatsApp delivery receipts: **Sent → Delivered → Seen** — the same confidence as a bank alert.

---

## Architecture

```
┌──────────────────┬──────────────────┬───────────────────────────┐
│   Frontend       │   Backend        │   Blockchain              │
│   Next.js 15     │   Node.js        │   Solana + Anchor         │
│   React 19       │   Next.js API    │   SPL Token Program       │
│   Tailwind v4    │   Postgres DB    │   Ed25519 Program         │
│                  │   WhatsApp API   │   Per-payment PDAs        │
└──────────────────┴──────────────────┴───────────────────────────┘
```

### Identity layer

Phone → SHA-256 hash → on-chain `IdentityBinding` PDA · WhatsApp OTP · In-app PIN · Master → ephemeral child keys

### Escrow layer (v3)

`EscrowV3` PDA seeded by `child_hash + nonce + mint` · Ed25519 derivation proofs · Bitmask nonce PDAs · Destination hash binding · Auto-claim crank

---

## Authentication

TrustLink uses WhatsApp-based, session-code authentication:

1. **Session code generated** (e.g. `TL-8821`, expires in 10 min)
2. **User sends code via WhatsApp** — verified in real-time (SSE with polling fallback)
3. **PIN setup / verify** — 6-digit second factor
4. **Wallet connection** — Solana wallet signature proves ownership

Device-aware: mobile gets a direct WhatsApp link; desktop gets a QR code.

---

## Current Status

- ✅ WhatsApp OTP authentication + session codes
- ✅ Recipient identity verification before send
- ✅ Per-payment escrow creation + gasless UX
- ✅ Delivery receipts (sent / delivered / seen)
- ✅ Manual invite flow for unregistered recipients
- ✅ WhatsApp Business identity verification
- ✅ Hardened v3 escrow with derivation proofs
- ✅ In-app PIN security gating

---

## Repository Structure

| Path                                         | Description                                             |
| -------------------------------------------- | ------------------------------------------------------- |
| `backend/programs/trustlink-escrow`          | Anchor escrow program (v2 + v3)                         |
| `backend/app/blockchain/trustlink-pay-v3.ts` | Transaction builders                                    |
| `backend/app/lib/privacy-keys.ts`            | Privacy key derivation + proofs                         |
| `frontend`                                   | Next.js 15 frontend                                     |
| `docs/`                                      | Architecture, escrow design, wallet roles, devnet guide |

## Quick Start

```bash
# Backend
cd backend && npm install && npm run db:init && npm run dev

# Frontend
cd frontend && npm install && npm run dev

# Tests
cd backend
npm run test:auth-phone-flow
npm run test:payment-flow
```

See [docs/devnet-testing.md](docs/devnet-testing.md) for devnet SOL, test USDC, and end-to-end payment testing.

---

**TrustLink Pay** — crypto payments that feel as familiar as a bank alert, settled noncustodially on Solana.
