# TrustLink Pay Documentation

TrustLink Pay is a TIN-first private settlement ecosystem on Solana.

The public product surface is simple:

```text
Send stablecoins to a 10-digit Transfer Identity Number.
```

The protocol surface is deeper:

- **TINS** provides wallet-owned 10-digit payment identity.
- **TSN** separates sender-side escrow from recipient-side payout.
- **Crankers** verify and execute settlement work.
- **Vault liquidity** makes recipient payout possible without direct wallet-to-wallet settlement.

Phone numbers, WhatsApp, and social identities are optional application-layer links. They can help with notifications, account recovery, consent, and future discovery, but they are not the primary protocol identity.

---

## Start Here

| Document | Purpose |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture across TINS, TSN, app, mempool, and crankers |
| [PROTOCOL.md](./PROTOCOL.md) | Protocol-grade settlement specification |
| [TINS.md](./TINS.md) | Transfer Identity Number System |
| [SECURITY.md](./SECURITY.md) | Security and privacy model |
| [INTEGRATION.md](./INTEGRATION.md) | SDK integration guide |
| [CRANKER.md](./CRANKER.md) | Cranker operator guide |
| [LIQUIDITY.md](./LIQUIDITY.md) | Vault liquidity and LP model |
| [EPOCH-SETTLEMENT.md](./EPOCH-SETTLEMENT.md) | Epoch reimbursement and accounting |
| [OTDT-SMART-RECOVERY.md](./OTDT-SMART-RECOVERY.md) | OTDT, claim leases, commitment registry, and smart recovery runtime |
| [FRONTEND-MODULAR-ARCHITECTURE.md](./FRONTEND-MODULAR-ARCHITECTURE.md) | Frontend component map, modularization rules, and privacy-preserving UI structure |

---

## Core Concepts

### TINS

TINS is the identity layer. It gives a user a 10-digit Transfer Identity Number that can be shared instead of a wallet address.

TINs are designed to become a receive identity for:

- TrustLink Pay,
- wallets,
- merchant tools,
- payment links,
- privacy-preserving Solana applications.

### TSN

TSN is the settlement layer. It exists because resolving a TIN directly to a wallet and transferring normally would expose the payment graph.

TSN splits settlement into:

1. sender authorization,
2. cranker verification,
3. sponsored escrow,
4. vault payout,
5. proof and accounting.

### Crankers

Crankers are verified operators. They monitor the mempool, reject invalid work, sponsor escrow transactions, earn claim credit, and execute recipient payouts from vault liquidity.

### Privacy Boundary

TrustLink does not claim that Solana transactions disappear. The privacy goal is narrower and stronger: the normal payment path should not expose a simple sender-wallet-to-recipient-wallet transfer.

To understand the full settlement path, an observer needs specific transaction hashes, vault context, or program-level knowledge.

---

## Current Program IDs

| Program | Devnet ID |
| --- | --- |
| TINS | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |
| TSN | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |

---

## Repository Map

| Path | Purpose |
| --- | --- |
| `frontend/` | TrustLink Pay application UI |
| `backend/` | API, user state, notifications, and payment records |
| `tins-registrar/` | TINS Solana program |
| `tins-sdk/` | TINS SDK package surface |
| `tsn/protocol/` | TSN Anchor program workspace |
| `tsn-sdk/` | TSN SDK |
| `tsn-cranker-op-daemon/` | Reference cranker daemon |
| `tsn-mempool-backend/` | TSN mempool service |
| `tsn-mempool-frontend/` | Mempool explorer |

---

## WhatsApp And Social Identity

WhatsApp remains useful for authentication, notifications, consent, and optional social linking. It should be documented as an application feature, not as the core settlement identity.

The protocol identity is the TIN.
- [Vercel Deployment Notes](./VERCEL-DEPLOYMENT.md) — monorepo build boundaries for the frontend, backend, TSN SDK, and Cranker daemon.
