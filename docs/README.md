# TrustLink Pay Documentation

TrustLink Pay is a TIN-first private settlement ecosystem on Solana.

The public product surface is simple:

```text
Send stablecoins to a 10-digit Transfer Identity Number.
```

The protocol surface has four parts:

- **TINS** — the Transfer Identity Number System. Gives each user a 10-digit number (a TIN) to share instead of a wallet address.
- **TSN** — the Transfer Settlement Network. Splits payment into sender-side escrow and recipient-side vault payout so the payment path is not a direct wallet-to-wallet transfer.
- **Crankers** — verified operators that validate settlement work, sponsor escrow transactions, and execute vault payouts.
- **TrustLink App** — the first product built on TINS and TSN.

Phone numbers, WhatsApp, and social accounts are optional links to a TIN. They help with notifications, recovery, and consent. The protocol identity is the TIN.

---

## Foundational Reading

- **[TrustLink Pay Security Philosophy: Secure Web3 Payments Without Becoming a Bank of Regret](./SECURITY-PHILOSOPHY.md)** — essential reading for new team members, developers, Crankers, and community members.

## Start Here

| Document | Purpose |
| --- | --- |
| [SECURITY-PHILOSOPHY.md](./SECURITY-PHILOSOPHY.md) | TrustLink Pay security philosophy for secure Web3 payments, privacy, and operator responsibility |
| [START-HERE.md](./START-HERE.md) | Plain-language entry point for TINS, SAS, TSN, Crankers, OTDT, and privacy flows |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture across TINS, TSN, app, mempool, and crankers |
| [PROTOCOL.md](./PROTOCOL.md) | Protocol-grade settlement specification |
| [TINS.md](./TINS.md) | Transfer Identity Number System |
| [SECURITY.md](./SECURITY.md) | Security and privacy model |
| [INTEGRATION.md](./INTEGRATION.md) | SDK integration guide |
| [CRANKER.md](./CRANKER.md) | Cranker operator guide |
| [LIQUIDITY.md](./LIQUIDITY.md) | Vault liquidity and LP model |
| [EPOCH-SETTLEMENT.md](./EPOCH-SETTLEMENT.md) | Epoch reimbursement and accounting |
| [EPOCH-SETTLEMENT-v1-EXPERIMENTAL.md](./EPOCH-SETTLEMENT-v1-EXPERIMENTAL.md) | v1 per-epoch PEA, PaymentCommitment, PrivacyReceivePDA, and competitive Cranker recovery race |

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
| `tins-sdk/` | TINS SDK package surface |
| `tsn/protocol/` | TSN Anchor program workspace |
| `tsn-sdk/` | TSN SDK |
| `tsn-cranker-op-daemon/` | Reference cranker daemon |
| `tsn-mempool-backend/` | TSN mempool service |
| `tsn-mempool-frontend/` | Mempool explorer |
