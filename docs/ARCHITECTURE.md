# TrustLink Pay Architecture

TrustLink Pay has four active layers:

1. TINS — identity
2. TSN — settlement
3. Cranker — execution
4. TrustLink Pay — application

The system is TIN-first. A user receives through a 10-digit Transfer Identity Number (TIN). TSN handles private settlement behind the payment surface.

---

## Layer 1: TINS Identity

TINS is the Transfer Identity Number System. It gives users a permanent numeric identity that can be shared instead of a wallet address.

```text
10-digit TIN -> identity PDA -> settlement route
```

A PDA (Program Derived Address) is an on-chain account controlled by a program, not by a private key. TINS uses PDAs to store identity records.

The TIN is the public payment identity. The wallet address is not exposed as the payment identity.

Phone numbers, WhatsApp accounts, and other social links can be linked to a TIN. Those links are application-layer trust signals. They are not required for the protocol.

---

## Layer 2: TSN Settlement

TSN is the Transfer Settlement Network. It separates sender-side funding from recipient-side payout so a payment does not look like a direct wallet-to-wallet transfer.

TSN settlement uses:

- sender authorization
- cranker-sponsored escrow
- vault and token-account isolation
- cranker vault liquidity
- claim credit
- off-chain proof records

The sender signs approval. The cranker validates the work and broadcasts the settlement transaction.

---

## Layer 3: Cranker Execution

Crankers are verified settlement operators. They:

- monitor the TSN mempool for pending settlement work
- validate sender-signed payloads
- reject tampered work
- sponsor escrow transactions
- earn claim credit
- execute payouts from vault liquidity
- publish proof records

Crankers are part of the privacy design. They break the clean link between sender-side escrow funding and recipient-side payout.

---

## Layer 4: TrustLink Pay App

The TrustLink Pay app is the first product built on TINS and TSN. It provides:

- TIN creation and display
- payment creation
- wallet signing
- transaction history
- status tracking
- notifications

The payment identity is the TIN. WhatsApp is an optional channel for authentication and notifications.

---

## Payment Path

```text
Sender enters recipient TIN
TrustLink resolves TIN settlement route
Sender signs TSN authorization
Authorization enters TSN mempool
Cranker validates work
Cranker sponsors escrow
Funds move into TSN vault path
Claim work becomes available
Cranker executes payout from vault liquidity
Proof is recorded through transaction hashes and mempool state
```

---

## Data Boundaries

| Data | Layer | Visibility |
| --- | --- | --- |
| TIN | TINS | Public payment identity |
| Display name | TINS / app | Public user confirmation |
| Wallet address | Wallet / route | Not the public payment identity |
| Sender authorization | TSN mempool / app record | Settlement work record |
| Escrow transaction hash | TSN / app record | Sender-visible settlement hash |
| Payout or proof transaction hash | TSN / app record | Recipient or operator settlement proof |
| Phone or WhatsApp link | TrustLink app | Optional private application mapping |

---

## Current Devnet Programs

| Program | Program ID |
| --- | --- |
| TINS | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` |
| TSN | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` |

---

## Related Docs

- [TINS.md](./TINS.md)
- [PROTOCOL.md](./PROTOCOL.md)
- [SECURITY.md](./SECURITY.md)
- [CRANKER.md](./CRANKER.md)
- [LIQUIDITY.md](./LIQUIDITY.md)

## Related Security Philosophy

For the security-first reasoning behind this architecture, read [TrustLink Pay Security Philosophy: Secure Web3 Payments Without Becoming a Bank of Regret](./SECURITY-PHILOSOPHY.md).
