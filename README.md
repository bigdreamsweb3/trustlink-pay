# TrustLink Pay

![TrustLink Pay Logo](public/trustlink-logo.png)

Send stablecoins on Solana to WhatsApp numbers with the same confidence as a bank alert.

TrustLink Pay is a phone-number-first crypto payments product that replaces long wallet addresses with a familiar identity layer: a verified WhatsApp number. Instead of asking everyday users to copy and validate unreadable addresses, TrustLink lets a sender enter a phone number, fund a smart-contract escrow, and trigger a WhatsApp claim flow for the receiver.

## Why This Matters

Crypto payments still break down at the exact moment they should feel simplest: sending money to another person. Wallet addresses are long, easy to misread, and impossible to verify by eye. Because onchain transfers are irreversible, a small mistake can become a permanent loss.

TrustLink Pay is built to make crypto transfers feel closer to the payment experiences people already trust in mobile money apps like OPay, Paytm, and Pix:

- phone-number based recipient identity
- stablecoin-first payment UX
- escrow before release
- WhatsApp notifications and claim flow
- wallet verification before funds are released

## The Problem

For most non-crypto users, blockchain payments are still too fragile for everyday use:

- Wallet addresses are long, confusing, and error-prone.
- Transactions are irreversible, so mistakes become permanent loss.
- Users are expected to understand wallet management before they can even receive money.
- Address poisoning and clipboard replacement attacks make copy-paste unsafe.

### Real-World Example: Address Poisoning

On November 23, 2024 at 04:47 UTC, a Solana user reportedly lost $2.91 million after copying a fake wallet address that closely resembled the intended one.

![Illustration of an address-poisoning style payment scam](public/nov-23-24-crypto-loss-to-scam.png)

- Intended: `4yfu48...gnhY`
- Fake: `4yfuQC...izcY`

Attack pattern:

- The attacker inserted a lookalike address into the victim's transaction history.
- The victim copied the wrong address.
- Funds were sent and could not be recovered.

References:

- [Solscan transaction](https://solscan.io/tx/T3vqZjMEi8MrJ34pwgnPG1ZjrFwygw6KYzij4Rt8dcFp2gZMqurHxC2Ta9gK7gELq2XXr4xpyotUYZryvQ2h5RP)
- [Article source](https://www.the-blockchain.com/2024/11/25/solana-user-losses-2-91million-in-an-address-poisoning-scam-are-these-scams-becoming-a-nightmare-for-crypto-users/)

## The Solution

TrustLink Pay turns a WhatsApp number into a payment destination.

The sender:

- logs in with a WhatsApp-linked TrustLink account
- connects a Solana wallet
- selects a supported stablecoin
- enters the receiver's WhatsApp number
- confirms the transfer into escrow

The receiver:

- gets a WhatsApp notification
- opens a secure claim link
- verifies identity
- connects or selects a wallet
- receives funds only after claim conditions are met

This bridges traditional finance behavior and blockchain execution without forcing users to think like wallet operators first.

## Core Product Features

- Phone-number payments instead of raw wallet-address entry
- Stablecoin-focused transfers for real-world transactions
- Smart contract escrow before release
- WhatsApp delivery and claim notifications
- Receiver onboarding during claim
- Wallet verification before release
- Reference IDs for reconciliation and tracking

## How It Works

### Sender Flow

1. Sign in with a WhatsApp-linked TrustLink account.
2. Connect a Solana wallet such as Phantom, Solflare, Backpack, Glow, Exodus, Trust Wallet, or OKX-compatible Solana browser wallet.
3. Enter the receiver's WhatsApp number, amount, and supported token.
4. Review recipient identity before sending.
5. Approve the transaction.
6. Funds move into escrow.
7. The receiver gets a WhatsApp notification with a secure claim link.

### Receiver Flow

1. Open the claim link from WhatsApp.
2. Sign in or onboard.
3. Select or verify a receiving wallet.
4. Complete claim verification.
5. Receive the released stablecoins from escrow.

## Why WhatsApp

TrustLink uses WhatsApp as a distribution and identity layer because:

- users are already reachable there
- phone numbers are familiar payment identifiers
- WhatsApp is already embedded in informal commerce and customer communication
- recipients do not need prior crypto onboarding before receiving a notification

## Architecture

### Frontend

- Next.js
- TypeScript
- mobile-first wallet and claim UX

### Backend

- Next.js / Node.js
- TypeScript
- NeonDB / PostgreSQL
- payment tracking
- messaging orchestration
- identity and OTP verification

### Blockchain Layer

- Solana
- Anchor-based escrow program
- escrow creation, claim, cancellation, and expiry logic

### Messaging Layer

- WhatsApp Business API
- recipient alerts
- onboarding and claim notifications

## Repository Structure

- [backend](backend/README.md)
  - backend services, APIs, database logic, WhatsApp integration, and Solana program workspace
- [frontend](frontend/README.md)
  - user-facing payment, send, receive, and claim experience
- [public](public/README.md)
  - public-facing assets, screenshots, demo files, and shareable brand materials

## Screenshots and Demo Assets

This repository does not yet include polished product screenshots. To make this README feel more visual and pitch-ready, add screenshots to `public/screenshots/` using these names:

- `01-home-dashboard.png`
- `02-send-flow.png`
- `03-recipient-preview.png`
- `04-whatsapp-notification.png`
- `05-claim-flow.png`
- `06-success-state.png`

Recommended capture sequence:

1. Dashboard with wallet connected and pending claims visible
2. Send flow with recipient identity preview
3. Token selector and supported balances
4. WhatsApp payment notification on a phone
5. Claim screen with wallet selection
6. Claim success screen with reference and release details

Once those are added, place them in this README directly under the matching sections for a more visual, step-by-step walkthrough.

## Potential Impact

TrustLink Pay can expand stablecoin adoption on Solana by removing one of the biggest UX barriers in crypto: address-based payments. It opens a path toward:

- cross-border payments
- payroll distribution
- remittances
- merchant settlements
- crypto onboarding for mobile-first users

In markets where phone-number payments are already normal, TrustLink can make stablecoin payments feel immediately understandable.

## Current Status

TrustLink Pay already includes:

- an organized backend and frontend codebase
- WhatsApp-based payment notification flows
- identity-aware sender and receiver UX
- a Solana escrow program workspace under active development

## Quick Start

### Backend

```bash
cd backend
npm install
npm run db:init
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Notes For Reviewers

- `public/` contains assets intended to be safely visible in a public GitHub repository.
- `backend/` and `frontend/` contain the private hackathon/application code.
- Sensitive environment files, local keys, caches, and build artifacts are excluded from Git.
