# TrustLink Pay

> Identity-first stablecoin payments on Solana, with private settlement and open identity infrastructure.

The world already knows how to pay with a phone number. Nigeria uses OPay. India uses UPI. Brazil uses Pix. Billions of transactions happen every day through these systems because they solved the one thing crypto has not: **identity-first payments**.

TrustLink Pay brings that identity-first experience to Solana payments. Users send approved stablecoins, and over time approved SPL assets, to a human identity instead of a wallet address. TrustLink starts with phone-number identity, expands toward a permanent on-chain Transfer Identity Number System (TINS), and settles through the Transfer Settlement Network (TSN), a Cranker-powered liquidity network where operators execute payments and liquidity providers earn from real settlement volume.

## TSN Privacy Guarantee

TSN is a privacy-preserving transfer settlement layer.

It avoids direct wallet-to-wallet settlement exposure by splitting payment into private stages:

1. sender-side escrow lock
2. private recipient claim flow
3. Cranker-executed payout path
4. epoch reimbursement path

Result:

- sender does not need recipient wallet visibility
- recipient does not need sender wallet visibility
- settlement remains verifiable through proof and deterministic protocol state

---

## Project Architecture

TrustLink Pay is built as three connected layers: the dApp, the TSN settlement protocol, and the TINS identity protocol.

### 1. Application Layer (TrustLink Pay)

- user onboarding and identity UX
- payment initiation and confirmation flow
- sender and recipient app experience

### 2. Identity Layer (TINS)

- permanent 10-digit transfer identity
- privacy-preserving identity resolution
- on-chain registry portability for external builders

### 3. Settlement Layer (TSN)

- temporary escrow-first routing
- private claim execution path
- cranker-based payout and proof submission
- epoch accounting and settlement distribution

### Secure Mempool Payment Intent Processing

TSN uses a mempool-first payment-intent path for secure settlement execution.

- payment services publish payment intents to TSN Mempool before any on-chain intent is created
- only a registered/verified Cranker can submit or create a TSN payment intent on-chain
- Cranker intent submission is gated by protocol registration and lease/credit rules

## TINS Production Ready ?

TINS is now **live and production-ready**:

- **10-digit identity numbers** (like bank account numbers)
- **Main wallet NEVER on-chain** (privacy first)
- **Multi-sig wallet rotation** (2/3 recovery wallets)
- **Anti-enumeration protection** (HMAC-based TIN generation)
- **Team fees** (prevents abuse)

### Security Features Implemented

| Feature | Status |
|---------|--------|
| Main wallet off-chain | ? Implemented |
| Privacy key derived (BIP-44) | ? Implemented |
| Display name verification | ? Implemented |
| Anti-enumeration TINs | ? Implemented |
| Multi-sig recovery (2/3) | ? Implemented |
| 24hr rotation cooldown | ? Implemented |
| Rate limiting | ? Implemented |
| Team fees | ? Implemented |

### Fees (All to Team Treasury)

| Action | Fee |
|--------|-----|
| Create TIN | 0.01 SOL |
| Rotate wallet | 0.005 SOL |
| Add recovery | 0.002 SOL |

---

## Milestones

### Milestone 1 - StableHacks 2026

Programmable stablecoin payment path with escrow-first UX and identity routing.

### Milestone 2 - The Bags Hackathon

Extended identity-first flow to approved SPL asset payment routes.

### Milestone 3 - TINS Protocol

Production-ready transfer identity infrastructure for on-chain transfer identity routing.

### Milestone 4 - TSN Settlement Network

Cranker execution, Proof of Payment, mempool-first intents, and epoch reimbursement architecture.

---

## Repository Structure

| Path | Purpose |
| --- | --- |
| `frontend` | Next.js dApp and user flow UI |
| `backend` | API, orchestration, and service logic |
| `tsn/protocol` | Anchor program workspace |
| `tsn` | TSN modules, scripts, and SDK packages |
| `tins-registrar` | TINS on-chain identity protocol |
| `docs` | Architecture and operational docs |

## Quick Start

```bash
cd backend && npm install && tsx scripts/init-db.ts && npm run dev
cd frontend && npm install && npm run dev
```

---

**TrustLink Pay** - identity-first payments on Solana, settling through TSN with privacy, liquidity-backed execution, and open protocol infrastructure that developers can build on.
