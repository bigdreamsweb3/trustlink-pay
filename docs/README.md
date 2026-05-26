# TrustLink Pay Documentation

Welcome to the TrustLink Pay documentation. This section provides comprehensive guides for operators, liquidity providers, and developers building on the TSN and TINS protocols.

---

## Quick Navigation

### For Investors & Liquidity Providers

| Document | Description |
|----------|-------------|
| [OPPORTUNITY.md](./OPPORTUNITY.md) | **Start here** - Overview of investment opportunities, yield projections, and partnership benefits |
| [LIQUIDITY.md](./LIQUIDITY.md) | How to fund TSN vaults, earn LP rewards, and maximize yield |
| [EPOCH-SETTLEMENT.md](./EPOCH-SETTLEMENT.md) | Understanding the epoch reimbursement cycle and capital risk |

### For Cranker Operators

| Document | Description |
|----------|-------------|
| [CRANKER.md](./CRANKER.md) | **Start here** - Complete guide to running a cranker node, acquiring leases, and earning operator rewards |
| [OPERATOR.md](./OPERATOR.md) | Technical setup, configuration, and monitoring |
| [EPOCH-SETTLEMENT.md](./EPOCH-SETTLEMENT.md) | How epoch reimbursements work and capital management |

### For Stablecoin Issuers & Partners

| Document | Description |
|----------|-------------|
| [OPPORTUNITY.md](./OPPORTUNITY.md) | Why stablecoin issuers should fund TSN vaults and run cranker nodes |
| [LIQUIDITY.md](./LIQUIDITY.md) | How to deploy your token, fund a vault, and drive adoption |

### For Developers

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture overview (TINS + TSN + dApp) |
| [TINS.md](./TINS.md) | Transfer Identity Number System - on-chain identity protocol |
| [PROTOCOL.md](./PROTOCOL.md) | Core protocol specifications and state machines |
| [DEVELOPER.md](./DEVELOPER.md) | Security considerations, known issues, and integration guide |
| [API.md](./API.md) | API reference documentation |
| [SUPPORTED-TOKENS.md](./SUPPORTED-TOKENS.md) | Supported-token source of truth, wallet token loading, and on-chain registry plan |
| [AI-PROTECTION.md](./AI-PROTECTION.md) | AI-powered fraud detection and mempool protection |

### For Security-Conscious Users

| Document | Description |
|----------|-------------|
| [AI-PROTECTION.md](./AI-PROTECTION.md) | **Important** - AI fraud detection, anomaly detection, and cranker jail system |
| [SECURITY.md](./SECURITY.md) | Complete security architecture including AI protection components |

---

## Core Concepts

### What is TSN?

The Transfer Settlement Network (TSN) is TrustLink Pay's privacy-preserving settlement layer on Solana. It enables fast, private phone-number-based payments where:

- **Senders** pay an identity (phone/TIN), not a wallet address
- **Recipients** claim funds from escrow via cranker operators
- **Settlement** happens through epoch-based reimbursement cycles
- **Privacy** is preserved - no direct wallet-to-wallet link visible on-chain

### What is TINS?

The Transfer Identity Number System (TINS) is an on-chain identity protocol that gives every user a permanent 10-digit identifier (like a bank account number) as a Solana PDA. Users own their identity without relying on TrustLink's backend.

### The Two Key Roles

| Role | Responsibility | Earns |
|------|---------------|-------|
| **Crankers** | Execute payments, monitor intents, submit proof, maintain uptime | 5% of settlement fees |
| **Liquidity Providers** | Fund token-specific vaults that crankers draw from | 87% of settlement fees |

---

## Document Purpose Guide

**I want to understand the opportunity** → Start with [OPPORTUNITY.md](./OPPORTUNITY.md)

**I want to run a cranker** → Start with [CRANKER.md](./CRANKER.md)

**I want to fund a vault as LP** → Read [LIQUIDITY.md](./LIQUIDITY.md)

**I want to understand how payments settle** → Read [EPOCH-SETTLEMENT.md](./EPOCH-SETTLEMENT.md)

**I want to build on TSN/TINS** → Start with [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Fee Distribution Summary

Every settlement fee is distributed as follows:

| Recipient | Share | Purpose |
|-----------|------:|--------|
| Liquidity Providers | 87% | Rewards vault capital that makes instant settlement possible |
| TSN Protocol Treasury | 8% | Supports protocol development, audits, and operations |
| Cranker/Operator | 5% | Covers uptime, execution, proof submission, and operational costs |

---

## Launch Strategy

At launch, **TrustLink Pay will be the first and primary cranker operator**. This controlled start ensures high reliability and performance while the network proves itself.

### Phase 1: Controlled Launch (TrustLink Pay as Primary Operator)

- TrustLink Pay deploys token-specific vaults (starting with USDC)
- TrustLink runs cranker nodes on high-performance infrastructure
- Stablecoin issuers and firms are invited to fund vaults and earn LP yields
- The token with the most vault liquidity becomes the fastest settlement option

### Phase 2: Network Expansion

- As payment volume grows, additional stablecoin issuers and firms will see the opportunity
- New vaults are deployed for tokens as demand increases
- Issuers can choose to:
  - Fund the vault and let TrustLink continue running the cranker, or
  - Deploy and operate their own verified cranker + vault for full control

### Growth Flywheel

```
More Liquidity → Faster Settlements → More Users → Higher Volume → Better Yields → More Participants
```

---

## Contact & Partnership

Interested in funding a USDC vault, partnering as a cranker operator, or integrating your stablecoin?

- **Email**: [partnerships@trustlink.pay](mailto:partnerships@trustlink.pay)
- **Discord**: [Join our community](https://discord.gg/trustlink)
- **Twitter**: [@TrustLinkPay](https://twitter.com/TrustLinkPay)

---

## Repository Structure

| Path | Purpose |
|------|---------|
| `frontend/` | Next.js dApp and user flow UI |
| `backend/` | API, orchestration, and service logic |
| `tsn/protocol/` | Anchor program workspace |
| `tsn/` | TSN modules, scripts, and SDK packages |
| `tins-registrar/` | TINS on-chain identity protocol |
| `tsn-cranker-op-daemon/` | Cranker operator daemon |
| `tsn-cranker-sdk/` | SDK for cranker integration |
