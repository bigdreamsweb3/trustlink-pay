# TrustLink Pay

> Blockchain payments as familiar as mobile money. Privacy built into settlement.

TrustLink Pay brings identity-first payments to Solana. Users send stablecoins to a phone number instead of a wallet address. Funds settle privately through the Transfer Settlement Network (TSN), with liquidity provided by Cranker operators.

## The Problem

The world already knows how to pay with a phone number. Nigeria uses OPay. India uses UPI. Brazil uses Pix. Billions of transactions happen daily because they solved identity-first payments.

TrustLink Pay brings that UX to Solana with built-in privacy and open infrastructure.

## ⚡ Live Production Ready

### TINS - Transfer Identity Number System ✅

**TINS is live and production-ready:**
- 10-digit identity numbers (like bank account numbers)
- Main wallet NEVER on-chain (privacy first)
- Multi-sig wallet rotation (2/3 recovery)
- Anti-enumeration protection (HMAC-based)
- Team fees (prevents abuse)

### Security Status

| Feature | Status |
|---------|--------|
| Main wallet off-chain | ✅ Implemented |
| Privacy key derived (BIP-44) | ✅ Implemented |
| Display name verification | ✅ Implemented |
| Anti-enumeration TINs | ✅ Implemented |
| Multi-sig recovery (2/3) | ✅ Implemented |
| 24hr rotation cooldown | ✅ Implemented |
| Rate limiting | ✅ Implemented |
| Team fees | ✅ Implemented |

### Fees (All to Team)

| Action | Fee |
|--------|-----|
| Create TIN | 0.01 SOL |
| Rotate wallet | 0.005 SOL |
| Add recovery | 0.002 SOL |

## Quick Start

```bash
# Build TINS (production-ready)
cd transfer-identity-number-system-(TINS)/program
cargo build-bpf
solana program deploy target/deploy/tins.so --url devnet

# Backend (requires Neon database)
cd backend && npm install && tsx scripts/init-db.ts && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## Documentation

| Guide | Description |
| --- | --- |
| [TINS Guide](./transfer-identity-number-system-(TINS)/README.md) | Full TINS setup |
| [TINS-OPERATOR](./docs/TINS-OPERATOR.md) | Complete operator guide |
| [SECURITY](./docs/SECURITY.md) | Security model |
| [ARCHITECTURE](./docs/ARCHITECTURE.md) | System design |
| [PROTOCOL](./docs/PROTOCOL.md) | Payment flows |

## Project Structure

```
trustlink-pay/
├── transfer-identity-number-system-(TINS)/  # TINS - PRODUCTION ✅
│   └── program/
├── tsn/                                 # Settlement
│   └── protocol/
├── frontend/                            # dApp
├── backend/                           # API
└── docs/                            # Docs
```

## Key Concepts

- **TINS**: Transfer Identity Number - 10-digit payment identity
- **Phone-Number Identity**: Send to a phone number, not a wallet
- **TSN Privacy**: Settlement separates sender and recipient wallets
- **Cranker Operators**: Execute payments, earn from volume
- **Liquidity Providers**: Fund vaults, earn fees

## Architecture (Inspired by SNS)

TINS uses Solana Name Service patterns:
- Account-based registration (familiar on Solana)
- PDA-driven registry (battle-tested)

**Key difference:**
- TINS uses **escrow routing** - payments go through escrow
- **Main wallet never visible** - only derived privacy key on-chain

## Milestones Achieved ✅

- ✅ TINS program with secure TIN generation
- ✅ Privacy-first (no main wallet on-chain)
- ✅ Multi-sig wallet rotation (2/3)
- ✅ Anti-enumeration protection (HMAC-based)
- ✅ Team fees implemented
- ✅ Full documentation
